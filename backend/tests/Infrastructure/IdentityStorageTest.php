<?php

namespace Tests\Infrastructure;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

final class IdentityStorageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL iranti_test.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        $this->assertSame(0, Artisan::call('migrate:fresh', ['--force' => true]));
        DB::beginTransaction();
    }

    protected function tearDown(): void
    {
        if (getenv('IRANTI_INFRA_TESTS') === '1') {
            DB::rollBack();
        }
        parent::tearDown();
    }

    public function test_identity_constraints_and_framework_mapping(): void
    {
        $user = User::factory()->create(['email' => ' Mixed@Example.Test ']);
        $this->assertTrue(Str::isUuid($user->id));
        $this->assertSame('mixed@example.test', $user->email);
        $this->assertTrue(Hash::check('password', $user->getAuthPassword()));
        $this->assertSame('', $user->getRememberTokenName());
        $this->assertArrayNotHasKey('password', $user->toArray());
        $this->assertFalse(Schema::hasColumn('users', 'remember_token'));
        $this->assertFalse(Schema::hasColumn('users', 'is_admin'));
        $this->assertFalse(Schema::hasTable('personal_access_tokens'));
        $this->assertFalse(Schema::hasTable('customer_profiles'));

        foreach ([['email' => 'mixed@example.test'], ['email' => 'UPPER@example.test'], ['status' => 'invalid'], ['auth_version' => 0]] as $changes) {
            $this->rejects(function () use ($changes): void {
                DB::table('users')->insert(array_merge([
                    'id' => (string) Str::uuid(), 'name' => 'Constraint probe',
                    'email' => Str::uuid().'@example.test', 'password' => 'test-hash',
                ], $changes));
            });
        }
        foreach (['users_email_unique', 'users_status_index', 'sessions_user_id_index', 'sessions_last_activity_index', 'password_reset_tokens_created_at_index'] as $index) {
            $this->assertNotNull(DB::selectOne('SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ?', [$index]));
        }
    }

    public function test_encrypted_database_sessions_persist_expire_and_cascade(): void
    {
        $user = User::factory()->create();
        $this->app['auth']->guard('web')->setUser($user);
        config(['session.driver' => 'database', 'session.encrypt' => true]);
        $this->app['session']->forgetDrivers();
        $session = $this->app['session']->driver('database');
        $session->start();
        $session->put('probe', 'sensitive-probe-value');
        $session->save();
        $id = $session->getId();
        $row = DB::table('sessions')->find($id);
        $this->assertSame($user->id, $row->user_id);
        $this->assertLessThanOrEqual(45, strlen($row->ip_address ?? ''));
        $this->assertLessThanOrEqual(500, mb_strlen($row->user_agent ?? ''));
        $this->assertSame('UTC', DB::selectOne('SHOW timezone')->TimeZone);
        $this->assertStringNotContainsString('sensitive-probe-value', base64_decode($row->payload));
        $this->app['session']->forgetDrivers();
        $reloaded = $this->app['session']->driver('database');
        $reloaded->setId($id);
        $reloaded->start();
        $this->assertSame('sensitive-probe-value', $reloaded->get('probe'));
        $reloaded->put('probe', 'updated');
        $reloaded->save();
        $this->assertSame(1, DB::table('sessions')->where('id', $id)->count());
        $this->rejects(fn () => DB::table('sessions')->where('id', $id)->update(['user_id' => Str::uuid()]));
        $this->rejects(fn () => DB::table('sessions')->where('id', $id)->update(['last_activity' => -1]));
        DB::table('sessions')->where('id', $id)->update(['last_activity' => time() - 10000]);
        $this->assertSame('', $reloaded->getHandler()->read($id));
        $this->assertSame(1, $reloaded->getHandler()->gc(7200));
        $reloaded->getHandler()->setExists(false);
        $reloaded->save();
        $user->delete();
        $this->assertSame(0, DB::table('sessions')->where('id', $id)->count());
    }

    public function test_reset_repository_hashing_expiry_cleanup_and_user_association(): void
    {
        $user = User::factory()->create();
        $repository = Password::broker()->getRepository();
        $token = $repository->create($user);
        $row = DB::table('password_reset_tokens')->where('email', $user->email)->first();
        $this->assertNotSame($token, $row->token);
        $this->assertTrue(Hash::check($token, $row->token));
        $this->assertTrue($repository->exists($user, $token));
        $this->assertFalse($repository->exists($user, 'wrong-token'));
        $this->assertTrue($repository->recentlyCreatedToken($user));
        $replacement = $repository->create($user);
        $this->assertFalse($repository->exists($user, $token));
        $this->assertTrue($repository->exists($user, $replacement));
        $repository->delete($user);
        $this->assertFalse($repository->exists($user, $replacement));
        $expired = $repository->create($user);
        DB::table('password_reset_tokens')->where('email', $user->email)->update(['created_at' => now()->subMinutes(61)]);
        $this->assertFalse($repository->exists($user, $expired));
        $this->assertSame(0, Artisan::call('auth:clear-resets'));
        $this->assertSame(0, DB::table('password_reset_tokens')->where('email', $user->email)->count());
        $repository->create($user);
        $this->rejects(fn () => DB::table('password_reset_tokens')->insert(['email' => 'missing@example.test', 'token' => 'test', 'created_at' => now()]));
        $this->rejects(fn () => DB::table('users')->where('id', $user->id)->update(['email' => 'changed@example.test']));
        $user->delete();
        $this->assertSame(0, DB::table('password_reset_tokens')->where('email', $user->email)->count());
    }

    private function rejects(callable $operation): void
    {
        DB::beginTransaction();
        try {
            $operation();
            $this->fail('Expected PostgreSQL constraint rejection.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        } finally {
            DB::rollBack();
        }
    }
}
