<?php

namespace Tests\Infrastructure;

use Illuminate\Redis\RedisManager;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Predis\Connection\Resource\Exception\StreamInitException;
use Tests\Fixtures\FoundationProbe;
use Tests\TestCase;

final class InfrastructureTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Set IRANTI_INFRA_TESTS=1 with an isolated iranti_test PostgreSQL database and Redis.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
    }

    public function test_postgresql_migrate_rollback_and_reapply(): void
    {
        $version = DB::selectOne('SHOW server_version_num');
        $this->assertGreaterThanOrEqual(180000, (int) $version->server_version_num);
        $this->assertLessThan(190000, (int) $version->server_version_num);
        $this->assertTrue(Schema::hasTable('failed_jobs'));
        $this->assertSame(0, Artisan::call('migrate:reset', ['--force' => true]));
        $this->assertFalse(Schema::hasTable('failed_jobs'));
        $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
        $this->assertTrue(Schema::hasTable('failed_jobs'));
        $this->assertTrue(Schema::hasTable('users'));
        $this->assertSame(0, Artisan::call('migrate:fresh', ['--force' => true]));
        $this->assertTrue(Schema::hasTable('sessions'));
    }

    public function test_redis_cache_and_queue_success_and_failure(): void
    {
        $key = 'foundation-test-'.Str::uuid();
        $queue = 'foundation-test-'.Str::uuid();
        $this->assertNotEmpty(Redis::connection('default')->ping());
        try {
            Cache::store('redis')->put($key, 'before', 60);
            $this->assertSame('before', Cache::store('redis')->get($key));
            Queue::connection('redis')->push(new FoundationProbe($key), '', $queue);
            Artisan::call('queue:work', ['connection' => 'redis', '--queue' => $queue, '--once' => true, '--tries' => 1, '--timeout' => 30]);
            $this->assertSame('processed', Cache::store('redis')->get($key));
            Queue::connection('redis')->push(new FoundationProbe($key, true), '', $queue);
            Artisan::call('queue:work', ['connection' => 'redis', '--queue' => $queue, '--once' => true, '--tries' => 1, '--timeout' => 30]);
            $this->assertSame(1, DB::table('failed_jobs')->where('queue', $queue)->count());
        } finally {
            Cache::store('redis')->forget($key);
            DB::table('failed_jobs')->where('queue', $queue)->delete();
            Queue::connection('redis')->clear($queue);
        }
    }

    public function test_redis_outages_fail_readiness_and_limiter_without_database_corruption(): void
    {
        $before = DB::table('orders')->count();
        $original = config('database.redis');
        $manager = Redis::getFacadeRoot();
        try {
            config(['database.redis.default.port' => 1, 'database.redis.cache.port' => 1]);
            Redis::swap(new RedisManager($this->app, 'predis', config('database.redis')));
            Cache::forgetDriver('identity_limits');
            $this->assertSame(1, Artisan::call('app:readiness'));
            $output = Artisan::output();
            $this->assertStringContainsString('postgresql: OK', $output);
            $this->assertStringContainsString('redis_queue: UNAVAILABLE', $output);
            $this->assertStringContainsString('redis_cache: UNAVAILABLE', $output);
            try {
                Cache::store('identity_limits')->add('unavailable-probe', 1, 5);
                $this->fail('A failed limiter must not admit unmetered requests.');
            } catch (StreamInitException) {
                $this->assertSame($before, DB::table('orders')->count());
            }
        } finally {
            config(['database.redis' => $original]);
            Redis::swap($manager);
            Cache::forgetDriver('identity_limits');
        }
        $this->assertSame(0, Artisan::call('app:readiness'));
    }

    public function test_idle_queue_poll_finishes_before_redis_socket_timeout(): void
    {
        $this->assertLessThan(config('database.redis.default.read_write_timeout'), config('queue.connections.redis.block_for'));
        $this->assertNull(Queue::connection('redis')->pop('idle-probe-'.Str::uuid()));
    }
}
