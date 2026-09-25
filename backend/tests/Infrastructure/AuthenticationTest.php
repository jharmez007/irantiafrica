<?php

namespace Tests\Infrastructure;

use App\Identity\ResetPassword;
use App\Models\User;
use App\Notifications\RecoveryNotification;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class AuthenticationTest extends TestCase
{
    private array $jar = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL and Redis.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        config(['session.driver' => 'database', 'session.secure' => false, 'session.encrypt' => true,
            'cors.allowed_origins' => ['http://localhost:3000'], 'sanctum.stateful' => ['localhost:3000'],
            'cache.prefix' => 'auth-test-'.bin2hex(random_bytes(6))]);
        $this->app['session']->forgetDrivers();
        Notification::fake();
        $this->callBrowser('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    private function callBrowser(string $method, string $path, array $data = [], bool $csrf = true, string $origin = 'http://localhost:3000'): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('auth.driver');
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => $origin, 'HTTP_REFERER' => $origin.'/', 'CONTENT_TYPE' => 'application/json'];
        if ($csrf && isset($this->jar['XSRF-TOKEN'])) {
            $server['HTTP_X_XSRF_TOKEN'] = $this->jar['XSRF-TOKEN'];
        }
        $response = $this->call($method, $path, [], $this->jar, [], $server, json_encode($data));
        foreach ($response->headers->getCookies() as $cookie) {
            $this->jar[$cookie->getName()] = $cookie->getValue();
        }

        return $response;
    }

    private function register(): TestResponse
    {
        return $this->callBrowser('POST', '/api/v1/auth/register', ['name' => 'Customer', 'email' => ' Customer@Example.Test ', 'password' => 'A-long-test-passphrase', 'password_confirmation' => 'A-long-test-passphrase']);
    }

    public function test_registration_persistence_rotation_logout_and_no_secret_leakage(): void
    {
        $before = $this->jar[config('session.cookie')];
        $response = $this->register()->assertCreated()->assertJsonPath('data.email', 'customer@example.test');
        $this->assertNotSame($before, $this->jar[config('session.cookie')]);
        $this->assertSame(['id', 'name', 'email', 'authentication_state', 'email_verified', 'roles', 'permissions'], array_keys($response->json('data')));
        $response->assertJsonPath('data.permissions', []);
        $this->assertTrue(Hash::check('A-long-test-passphrase', User::first()->password));
        $this->assertSame(0, DB::table('user_roles')->count());
        $this->callBrowser('GET', '/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $response->json('data.id'));
        $old = $this->jar;
        $this->callBrowser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->callBrowser('GET', '/api/v1/auth/me')->assertUnauthorized();
        $this->jar = $old;
        $this->callBrowser('GET', '/api/v1/auth/me')->assertUnauthorized();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'identity.registered')->count());
        $this->assertStringNotContainsString('passphrase', json_encode(DB::table('audit_logs')->get()));
    }

    public function test_csrf_and_untrusted_origin_and_mass_assignment_are_rejected(): void
    {
        $payload = ['name' => 'Bad', 'email' => 'bad@example.test', 'password' => 'A-long-test-passphrase', 'password_confirmation' => 'A-long-test-passphrase'];
        $this->callBrowser('POST', '/api/v1/auth/register', $payload, false)->assertStatus(419);
        $this->callBrowser('POST', '/api/v1/auth/register', $payload, true, 'https://evil.example')->assertForbidden();
        $this->callBrowser('POST', '/api/v1/auth/register', $payload + ['roles' => ['owner']])->assertUnprocessable();
        $this->assertSame(0, User::count());
    }

    public function test_login_generic_failure_throttle_and_disabled_account(): void
    {
        User::factory()->create(['email' => 'person@example.test']);
        $known = $this->callBrowser('POST', '/api/v1/auth/login', ['email' => 'person@example.test', 'password' => 'wrong'])->assertUnauthorized();
        $unknown = $this->callBrowser('POST', '/api/v1/auth/login', ['email' => 'absent@example.test', 'password' => 'wrong'])->assertUnauthorized();
        $this->assertSame($known->json('error.message'), $unknown->json('error.message'));
        $this->callBrowser('POST', '/api/v1/auth/login', ['email' => 'person@example.test', 'password' => 'password'])->assertOk();
        User::where('email', 'person@example.test')->update(['status' => 'disabled']);
        $this->callBrowser('GET', '/api/v1/auth/me')->assertUnauthorized();
        for ($i = 0; $i < 5; $i++) {
            $this->callBrowser('POST', '/api/v1/auth/login', ['email' => 'limited@example.test', 'password' => 'wrong'])->assertUnauthorized();
        }
        $this->callBrowser('POST', '/api/v1/auth/login', ['email' => 'limited@example.test', 'password' => 'wrong'])->assertStatus(429)->assertHeader('Retry-After');
    }

    public function test_customer_cannot_select_another_identity_or_enter_staff_boundary(): void
    {
        $this->register()->assertCreated();
        $other = User::factory()->create();
        $this->callBrowser('GET', '/api/v1/customer?user_id='.$other->id)->assertOk()->assertJsonPath('data.email', 'customer@example.test');
        $this->callBrowser('GET', '/api/v1/customer/'.$other->id)->assertNotFound();
        $this->callBrowser('GET', '/api/v1/admin/access')->assertForbidden();
        $this->callBrowser('POST', '/api/v1/admin/staff', ['roles' => ['owner']])->assertForbidden();
        User::where('email', 'customer@example.test')->increment('auth_version');
        $this->callBrowser('GET', '/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_absolute_session_limit_and_cookie_flags(): void
    {
        $response = $this->register()->assertCreated();
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === config('session.cookie')) {
                $this->assertTrue($cookie->isHttpOnly());
                $this->assertSame('lax', $cookie->getSameSite());
                $this->assertSame('', $cookie->getDomain());
            }
        }
        config(['identity.absolute_seconds' => -1]);
        $this->callBrowser('GET', '/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_reset_is_generic_single_use_and_revokes_existing_sessions(): void
    {
        $this->register()->assertCreated();
        $old = $this->jar;
        $user = User::first();
        $known = $this->callBrowser('POST', '/api/v1/auth/password/forgot', ['email' => $user->email])->assertOk();
        $unknown = $this->callBrowser('POST', '/api/v1/auth/password/forgot', ['email' => 'absent@example.test'])->assertOk();
        $this->assertSame($known->json(), $unknown->json());
        Notification::assertSentTo($user, RecoveryNotification::class);
        $token = Notification::sent($user, RecoveryNotification::class)->first()->token;
        $data = ['email' => $user->email, 'token' => $token, 'password' => 'A-new-strong-passphrase', 'password_confirmation' => 'A-new-strong-passphrase'];
        $this->callBrowser('POST', '/api/v1/auth/password/reset', $data)->assertOk();
        $this->callBrowser('POST', '/api/v1/auth/password/reset', $data)->assertUnprocessable();
        $this->assertTrue(Hash::check($data['password'], $user->fresh()->password));
        $this->assertSame(2, $user->fresh()->auth_version);
        $this->jar = $old;
        $this->callBrowser('GET', '/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_parallel_reset_attempts_consume_token_once(): void
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Concurrency proof requires pcntl.');
        }
        $user = User::factory()->create();
        $token = Password::broker()->getRepository()->create($user);
        $directory = sys_get_temp_dir().'/iranti-reset-race-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        DB::disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid === -1) {
                    $this->fail('Unable to create concurrency worker.');
                }
                if ($pid === 0) {
                    $deadline = microtime(true) + 5;
                    while (! file_exists($directory.'/go') && microtime(true) < $deadline) {
                        usleep(10000);
                    }
                    try {
                        $result = app(ResetPassword::class)->execute(['email' => $user->email, 'token' => $token, 'password' => 'Concurrent-reset-passphrase']);
                        file_put_contents($directory.'/'.$i, $result ? 'accepted' : 'rejected');
                        DB::disconnect();
                        exit(0);
                    } catch (\Throwable) {
                        exit(1);
                    }
                }
                $children[] = $pid;
            }
            touch($directory.'/go');
            foreach ($children as $pid) {
                pcntl_waitpid($pid, $status);
                $this->assertSame(0, pcntl_wexitstatus($status));
            }
            $results = [file_get_contents($directory.'/0'), file_get_contents($directory.'/1')];
            sort($results);
            $this->assertSame(['accepted', 'rejected'], $results);
            $this->assertSame(1, DB::table('audit_logs')->where('action', 'identity.password_reset')->count());
            $this->assertSame(0, DB::table('password_reset_tokens')->count());
        } finally {
            foreach (glob($directory.'/*') as $file) {
                unlink($file);
            }
            rmdir($directory);
        }
    }
}
