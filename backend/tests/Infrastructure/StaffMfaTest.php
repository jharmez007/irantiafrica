<?php

namespace Tests\Infrastructure;

use App\Http\Middleware\CurrentIdentity;
use App\Http\Middleware\TrustedBrowser;
use App\Identity\PermissionMatrix;
use App\Identity\StaffAdministration;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Notifications\RecoveryNotification;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class StaffMfaTest extends TestCase
{
    private array $jar = [];

    private const PASSWORD = 'Staff-test-passphrase';

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
            'cache.prefix' => 'mfa-test-'.bin2hex(random_bytes(8)), 'hashing.bcrypt.rounds' => 4]);
        $this->app['hash']->forgetDrivers();
        $this->seed(IdentityPermissionsSeeder::class);
        Notification::fake();
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
        // Test-only capability endpoint: no commerce routes introduced into production.
        Route::middleware(['api', TrustedBrowser::class, 'auth:web', CurrentIdentity::class])
            ->get('/api/v1/test-permission/{permission}', function (string $permission) {
                Gate::authorize($permission);

                return response()->json(['data' => ['allowed' => true]]);
            });
    }

    private function browser(string $method, string $path, array $data = [], bool $csrf = true): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('auth.driver');
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => 'http://localhost:3000', 'HTTP_REFERER' => 'http://localhost:3000/', 'CONTENT_TYPE' => 'application/json'];
        if ($csrf && isset($this->jar['XSRF-TOKEN'])) {
            $server['HTTP_X_XSRF_TOKEN'] = $this->jar['XSRF-TOKEN'];
        }
        $response = $this->call($method, $path, [], $this->jar, [], $server, json_encode($data));
        foreach ($response->headers->getCookies() as $cookie) {
            $this->jar[$cookie->getName()] = $cookie->getValue();
        }

        return $response;
    }

    private function staff(string $role = 'owner'): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD])->refresh();
        $user->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['id' => (string) Str::uuid()]);

        return $user;
    }

    private function login(User $user): TestResponse
    {
        return $this->browser('POST', '/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD]);
    }

    private function enroll(User $user): array
    {
        $this->login($user)->assertOk()->assertJsonPath('data.authentication_state', 'enrollment_required');
        $setup = $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertOk()->json('data');
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $setup['qr']);
        $code = (new Google2FA)->oathTotp($setup['secret'], (new Google2FA)->getTimestamp() - 1);
        $codes = $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => $code])->assertOk()->json('data.recovery_codes');

        return [$setup['secret'], $codes, $code];
    }

    public function test_customer_cannot_enroll_and_anonymous_access_is_denied(): void
    {
        $this->browser('GET', '/api/v1/admin/access')->assertUnauthorized();
        $user = User::factory()->create(['password' => self::PASSWORD]);
        $this->login($user)->assertOk()->assertJsonPath('data.authentication_state', 'authenticated');
        $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertForbidden();
        $this->browser('POST', '/api/v1/admin/staff', ['role' => 'owner'])->assertForbidden();
        $this->browser('GET', '/api/v1/admin/access')->assertForbidden();
    }

    public function test_password_only_owner_is_restricted_and_confirmation_is_required(): void
    {
        $owner = $this->staff();
        $this->login($owner)->assertOk();
        $this->browser('GET', '/api/v1/admin/access')->assertForbidden();
        $this->browser('GET', '/api/v1/customer')->assertForbidden();
        $this->browser('POST', '/api/v1/auth/mfa/enroll', [], false)->assertStatus(419);
        $setup = $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertOk()->json('data');
        $this->assertNull($owner->fresh()->mfa_confirmed_at);
        $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => '000000'])->assertUnprocessable();
        $before = $this->jar;
        $code = (new Google2FA)->getCurrentOtp($setup['secret']);
        $codes = $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => $code])->assertOk()->json('data.recovery_codes');
        $this->assertCount(8, $codes);
        $this->assertNotSame($before[config('session.cookie')], $this->jar[config('session.cookie')]);
        $this->assertNotSame($setup['secret'], $owner->fresh()->mfa_secret_ciphertext);
        $this->assertSame($setup['secret'], Crypt::decryptString($owner->fresh()->mfa_secret_ciphertext));
        $this->assertTrue(Hash::check($codes[0], $owner->fresh()->mfa_recovery_hashes[0]));
        $this->browser('GET', '/api/v1/admin/access')->assertOk();
        $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertStatus(409);
        $this->browser('GET', '/api/v1/auth/me')->assertJsonPath('data.authentication_state', 'authenticated');
        $this->jar = $before;
        $this->browser('GET', '/api/v1/admin/access')->assertUnauthorized();
    }

    public function test_every_approved_matrix_cell_is_enforced_after_mfa(): void
    {
        $this->seed(IdentityPermissionsSeeder::class);
        $expected = [
            'owner' => ['catalog.read_internal', 'catalog.create_update', 'catalog.publish_archive', 'media.manage', 'inventory.read', 'inventory.adjust', 'inventory.movements.read', 'orders.read', 'orders.prepare', 'shipments.record', 'delivery.record', 'orders.cancel', 'payments.read_summary', 'payments.reconcile', 'exceptions.resolve', 'returns.read', 'returns.review', 'returns.decide', 'refunds.approve', 'refunds.submit', 'reports.sales', 'reports.products', 'reports.orders', 'reports.stock', 'customers.read_operational', 'tax.configure', 'shipping.configure', 'staff.provision', 'roles.assign', 'audit.read', 'security.configure'],
            'order_processing' => ['catalog.read_internal', 'inventory.read', 'orders.read', 'orders.prepare', 'shipments.record', 'delivery.record', 'payments.read_summary', 'returns.read', 'returns.review', 'reports.orders', 'customers.read_operational'],
            'inventory_store' => ['catalog.read_internal', 'inventory.read', 'inventory.movements.read', 'reports.stock'],
        ];
        $this->assertSame($expected, PermissionMatrix::grants());
        foreach ($expected as $role => $allowed) {
            $user = $this->staff($role);
            $this->enroll($user);
            foreach (PermissionMatrix::grants()['owner'] as $permission) {
                $response = $this->browser('GET', '/api/v1/test-permission/'.$permission);
                $response->assertStatus(in_array($permission, $allowed, true) ? 200 : 403);
            }
            $this->browser('GET', '/api/v1/test-permission/unapproved.magic')->assertForbidden();
            $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        }
    }

    public function test_totp_replay_and_recovery_code_reuse_are_rejected(): void
    {
        $user = $this->staff();
        [$secret, $codes, $usedCode] = $this->enroll($user);
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($user)->assertJsonPath('data.authentication_state', 'mfa_required');
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $usedCode])->assertUnprocessable();
        $current = (new Google2FA)->getCurrentOtp($secret);
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $current])->assertOk();
        $this->browser('POST', '/api/v1/auth/logout');
        $this->login($user);
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $current])->assertUnprocessable();
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $codes[0], 'recovery' => true])->assertOk();
        $this->browser('POST', '/api/v1/auth/logout');
        $this->login($user);
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $codes[0], 'recovery' => true])->assertUnprocessable();
        $this->assertCount(7, $user->fresh()->mfa_recovery_hashes);
    }

    public function test_regeneration_invalidates_previous_codes_and_requires_password_and_totp(): void
    {
        $user = $this->staff();
        [$secret, $codes] = $this->enroll($user);
        $current = (new Google2FA)->getCurrentOtp($secret);
        $this->browser('POST', '/api/v1/auth/mfa/recovery-codes', ['password' => 'incorrect', 'code' => $current])->assertUnprocessable();
        $new = $this->browser('POST', '/api/v1/auth/mfa/recovery-codes', ['password' => self::PASSWORD, 'code' => $current])->assertOk()->json('data.recovery_codes');
        $this->assertNotSame($codes, $new);
        $this->browser('POST', '/api/v1/auth/logout');
        $this->login($user);
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $codes[0], 'recovery' => true])->assertUnprocessable();
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $new[0], 'recovery' => true])->assertOk();
    }

    public function test_bootstrap_is_once_only_and_has_no_default_mfa(): void
    {
        $owner = app(StaffAdministration::class)->bootstrap('Owner', 'owner@example.test', self::PASSWORD);
        $this->assertTrue($owner->isStaff());
        $this->assertNull($owner->mfa_confirmed_at);
        try {
            app(StaffAdministration::class)->bootstrap('Other', 'other@example.test', self::PASSWORD);
            $this->fail('Bootstrap must not repeat.');
        } catch (HttpException $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }
        $this->login($owner);
        $this->browser('GET', '/api/v1/admin/access')->assertForbidden();
    }

    public function test_owner_provision_role_change_disable_and_admin_reset_revoke_sessions(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $ownerCookies = $this->jar;
        $created = $this->browser('POST', '/api/v1/admin/staff', ['name' => 'Operator', 'email' => 'operator@example.test', 'role' => 'order_processing'])->assertCreated()->json('data.id');
        $operator = User::findOrFail($created);
        Notification::assertSentTo($operator, RecoveryNotification::class);
        $token = Notification::sent($operator, RecoveryNotification::class)->first()->token;
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browser('POST', '/api/v1/auth/password/reset', ['email' => $operator->email, 'token' => $token, 'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])->assertOk();
        $this->enroll($operator);
        $operatorCookies = $this->jar;
        $this->browser('POST', '/api/v1/admin/staff/'.$owner->id.'/mfa-reset', ['reason' => 'lost_authenticator'])->assertForbidden();
        $this->browser('PATCH', '/api/v1/admin/staff/'.$operator->id.'/roles', ['role' => 'owner'])->assertForbidden();
        $this->jar = $ownerCookies;
        $this->browser('POST', '/api/v1/admin/staff/'.$owner->id.'/mfa-reset', ['reason' => 'lost_authenticator'])->assertForbidden();
        $this->browser('PATCH', '/api/v1/admin/staff/'.$owner->id.'/roles', ['role' => 'inventory_store'])->assertForbidden();
        $this->browser('POST', '/api/v1/admin/staff/'.$operator->id.'/mfa-reset', ['reason' => 'lost_authenticator'])->assertNoContent();
        $this->assertNull($operator->fresh()->mfa_confirmed_at);
        $this->jar = $operatorCookies;
        $this->browser('GET', '/api/v1/admin/access')->assertUnauthorized();
        $this->enroll($operator);
        $operatorCookies = $this->jar;
        $this->jar = $ownerCookies;
        $this->browser('PATCH', '/api/v1/admin/staff/'.$operator->id.'/roles', ['role' => 'inventory_store', 'permissions' => ['staff.provision']])->assertUnprocessable();
        $this->browser('PATCH', '/api/v1/admin/staff/'.$operator->id.'/roles', ['role' => 'inventory_store'])->assertNoContent();
        $this->jar = $operatorCookies;
        $this->browser('GET', '/api/v1/admin/access')->assertUnauthorized();
        $this->jar = $ownerCookies;
        $this->browser('POST', '/api/v1/admin/staff/'.$operator->id.'/disable')->assertNoContent();
        $this->assertSame('disabled', $operator->fresh()->status);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'identity.mfa_reset')->count());
    }

    public function test_recent_authentication_and_last_owner_protection(): void
    {
        $owner = $this->staff();
        [$secret] = $this->enroll($owner);
        $session = $this->app['session']->driver();
        $session->put('recent_auth_at', time() - 301);
        $session->save();
        $this->browser('GET', '/api/v1/test-permission/refunds.approve')->assertForbidden();
        $this->browser('GET', '/api/v1/test-permission/security.configure')->assertForbidden();
        $this->browser('POST', '/api/v1/admin/staff', ['name' => 'Staff', 'email' => 'staff@example.test', 'role' => 'inventory_store'])->assertForbidden();
        $this->browser('POST', '/api/v1/auth/reauthenticate', ['password' => self::PASSWORD, 'code' => (new Google2FA)->getCurrentOtp($secret)])->assertOk();
        $this->browser('POST', '/api/v1/admin/staff', ['name' => 'Staff', 'email' => 'staff@example.test', 'role' => 'inventory_store'])->assertCreated();
        // Defense in depth if a later grant mistakenly gives a non-owner role assignment power.
        $other = $this->staff('order_processing');
        $permission = Permission::where('code', 'roles.assign')->firstOrFail();
        Role::where('code', 'order_processing')->firstOrFail()->permissions()->attach($permission->id, ['id' => (string) Str::uuid()]);
        $this->enroll($other);
        $this->browser('PATCH', '/api/v1/admin/staff/'.$owner->id.'/roles', ['role' => 'inventory_store'])->assertStatus(409);
        $this->assertTrue($owner->fresh()->roles()->where('code', 'owner')->exists());
    }

    public function test_mfa_rate_limit_and_audit_secrets_are_protected(): void
    {
        $user = $this->staff();
        [$secret, $codes] = $this->enroll($user);
        $this->browser('POST', '/api/v1/auth/logout');
        $this->login($user);
        for ($i = 0; $i < 5; $i++) {
            $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => 'not-a-code'])->assertUnprocessable();
        }
        $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $codes[0], 'recovery' => true])->assertStatus(429)->assertHeader('Retry-After');
        $audit = json_encode(DB::table('audit_logs')->get());
        $this->assertStringNotContainsString($secret, $audit);
        $this->assertStringNotContainsString($codes[0], $audit);
        $this->assertStringNotContainsString(self::PASSWORD, $audit);
        $this->assertSame(5, DB::table('audit_logs')->where('action', 'identity.mfa_failed')->count());
    }

    public function test_concurrent_recovery_attempts_consume_only_once(): void
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires pcntl.');
        }
        $user = $this->staff();
        [, $codes] = $this->enroll($user);
        $this->browser('POST', '/api/v1/auth/logout');
        $this->login($user);
        $directory = sys_get_temp_dir().'/iranti-mfa-race-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        DB::disconnect();
        Redis::connection('default')->disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid === -1) {
                    $this->fail('Cannot fork concurrency worker.');
                }
                if ($pid === 0) {
                    $deadline = microtime(true) + 5;
                    while (! file_exists($directory.'/go') && microtime(true) < $deadline) {
                        usleep(10000);
                    }
                    try {
                        $response = $this->browser('POST', '/api/v1/auth/mfa/challenge', ['code' => $codes[0], 'recovery' => true]);
                        file_put_contents($directory.'/'.$i, (string) $response->getStatusCode());
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
            $this->assertSame(['200', '422'], $results);
            $this->assertCount(7, $user->fresh()->mfa_recovery_hashes);
        } finally {
            foreach (glob($directory.'/*') as $file) {
                unlink($file);
            }
            rmdir($directory);
        }
    }
}
