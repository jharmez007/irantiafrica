<?php

namespace Tests\Infrastructure;

use App\Identity\PendingMfaEnrollment;
use App\Jobs\ProcessProductImage;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\User;
use App\Notifications\RecoveryNotification;
use Illuminate\Cache\RateLimiter;
use Illuminate\Console\Scheduling\CacheSchedulingMutex;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Fixtures\DatabaseProbe;
use Tests\TestCase;

final class DatabaseRuntimeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL iranti_test.');
        }
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        $this->assertSame(0, Artisan::call('migrate:fresh', ['--force' => true]));
        config(['queue.default' => 'database', 'cache.default' => 'database', 'cache.limiter' => 'database']);
        Cache::forgetDriver('database');
    }

    private function work(string $queue): void
    {
        $this->assertSame(0, Artisan::call('queue:work', ['connection' => 'database', '--queue' => $queue, '--once' => true, '--tries' => 3, '--backoff' => 0, '--timeout' => 30, '--sleep' => 0]));
    }

    public function test_named_jobs_persist_and_a_new_worker_claims_them(): void
    {
        $key = 'db-job-'.Str::uuid();
        $queue = 'identity';
        Queue::connection('database')->push(new DatabaseProbe($key), '', $queue);
        $this->assertSame(1, DB::table('jobs')->where('queue', $queue)->count());
        $this->work($queue);
        $this->assertTrue(Cache::store('database')->get($key.':processed'));
        $this->assertSame(0, DB::table('jobs')->count());
        // A second worker invocation simulates a fresh process reading durable storage.
        Queue::connection('database')->push(new DatabaseProbe($key.'-again'), '', $queue);
        $this->work($queue);
        $this->assertTrue(Cache::store('database')->get($key.'-again:processed'));
    }

    public function test_delayed_job_and_expired_reservation_are_claimed_only_when_due(): void
    {
        $key = 'db-delay-'.Str::uuid();
        Queue::connection('database')->later(60, new DatabaseProbe($key), '', 'media');
        $this->assertNull(Queue::connection('database')->pop('media'));
        DB::table('jobs')->where('queue', 'media')->update(['available_at' => time() - 1]);
        $claimed = Queue::connection('database')->pop('media');
        $this->assertNotNull($claimed);
        $this->assertSame(1, (int) DB::table('jobs')->where('queue', 'media')->value('attempts'));
        DB::table('jobs')->where('queue', 'media')->update(['reserved_at' => time() - 91]);
        $this->work('media');
        $this->assertTrue(Cache::store('database')->get($key.':processed'));
    }

    public function test_retry_and_exhaustion_are_durable(): void
    {
        $key = 'db-retry-'.Str::uuid();
        Queue::connection('database')->push(new DatabaseProbe($key, 1), '', 'default');
        $this->work('default');
        $this->assertSame(1, DB::table('jobs')->count());
        $this->work('default');
        $this->assertTrue(Cache::store('database')->get($key.':processed'));
        $this->assertSame(2, (int) Cache::store('database')->get($key.':attempts'));

        $failedKey = 'db-fail-'.Str::uuid();
        Queue::connection('database')->push(new DatabaseProbe($failedKey, 4), '', 'default');
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->work('default');
        }
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertSame(1, DB::table('failed_jobs')->where('queue', 'default')->count());
    }

    public function test_after_commit_defers_and_rollback_discards_job(): void
    {
        DB::beginTransaction();
        Queue::connection('database')->push(new DatabaseProbe('commit-probe'), '', 'transactional');
        $this->assertSame(0, DB::table('jobs')->count());
        DB::rollBack();
        $this->assertSame(0, DB::table('jobs')->count());

        DB::beginTransaction();
        Queue::connection('database')->push(new DatabaseProbe('committed-probe'), '', 'transactional');
        DB::commit();
        $this->assertSame(1, DB::table('jobs')->where('queue', 'transactional')->count());
        $this->work('transactional');
    }

    public function test_database_cache_locks_limits_and_encrypted_mfa_ttl(): void
    {
        $cache = Cache::store('database');
        $key = 'db-cache-'.Str::uuid();
        $cache->put($key, 'value', 2);
        $this->assertSame('value', $cache->get($key));
        $lock = $cache->lock($key.':lock', 10);
        $this->assertTrue($lock->get());
        $this->assertFalse($cache->lock($key.':lock', 10)->get());
        $this->assertTrue($lock->release());
        $this->assertTrue($cache->lock($key.':lock', 10)->get());
        $limiter = new RateLimiter($cache);
        $limiter->hit($key.':limit', 60);
        $this->assertTrue($limiter->tooManyAttempts($key.':limit', 1));

        $user = User::factory()->create();
        $request = Request::create('/');
        $session = $this->app['session']->driver('array');
        $session->start();
        $request->setLaravelSession($session);
        PendingMfaEnrollment::put($request, $user, 'TEST-UNCONFIRMED-TOTP');
        $this->assertNull($session->get('pending_mfa_secret'));
        $this->assertSame('TEST-UNCONFIRMED-TOTP', PendingMfaEnrollment::get($request, $user));
        $pending = DB::table('cache')->where('key', 'like', '%mfa-enrollment%')->firstOrFail();
        $this->assertStringNotContainsString('TEST-UNCONFIRMED-TOTP', (string) $pending->value);
        $this->assertGreaterThanOrEqual(time() + 598, (int) $pending->expiration);
        $this->assertLessThanOrEqual(time() + 600, (int) $pending->expiration);
        PendingMfaEnrollment::forget($request, $user);
        $this->assertNull(PendingMfaEnrollment::get($request, $user));
        PendingMfaEnrollment::put($request, $user, 'SECOND-UNCONFIRMED-TOTP');
        DB::table('cache')->where('key', 'like', '%mfa-enrollment%')->update(['expiration' => time() - 1]);
        $this->assertNull(PendingMfaEnrollment::get($request, $user));
        $this->travel(3)->seconds();
        $this->assertNull($cache->get($key));
    }

    public function test_recovery_email_runs_on_identity_database_queue(): void
    {
        $user = User::factory()->create();
        $user->notify(new RecoveryNotification('harmless-test-token'));
        $this->assertSame(1, DB::table('jobs')->where('queue', 'identity')->count());
        $this->work('identity');
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertSame(0, DB::table('failed_jobs')->count());
    }

    public function test_image_job_runs_once_from_database_queue_and_keeps_derivatives_private(): void
    {
        config(['catalog.disk' => 'local']);
        Storage::fake('local');
        $product = Product::factory()->create();
        $image = imagecreatetruecolor(40, 30);
        ob_start();
        imagepng($image);
        $bytes = ob_get_clean();
        imagedestroy($image);
        $this->assertIsString($bytes);
        $key = 'quarantine/'.Str::uuid();
        Storage::disk('local')->put($key, $bytes);
        $media = ProductMedia::create([
            'product_id' => $product->id, 'object_key' => $key, 'status' => 'processing',
            'mime_type' => 'image/png', 'byte_size' => strlen($bytes), 'checksum' => hash('sha256', $bytes),
            'alt_text' => 'Queue test image',
        ]);
        ProcessProductImage::dispatch($media->id)->onQueue('media');
        $this->assertSame(1, DB::table('jobs')->where('queue', 'media')->count());
        $this->work('media');
        $this->assertSame('ready', $media->fresh()->status);
        $this->assertCount(3, $media->fresh()->derivatives);
        foreach ($media->fresh()->derivatives as $derivative) {
            $this->assertTrue(Storage::disk('local')->exists($derivative['key']));
        }
        ProcessProductImage::dispatch($media->id)->onQueue('media');
        $this->work('media');
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'catalog.media_ready')->where('subject_id', $media->id)->count());
    }

    public function test_each_scheduled_task_has_a_shared_database_mutex(): void
    {
        $events = Schedule::events();
        $this->assertCount(10, $events);
        foreach ($events as $event) {
            $this->assertTrue($event->onOneServer);
        }
        $mutex = new CacheSchedulingMutex(Cache::getFacadeRoot());
        $event = $events[0];
        $time = now();
        $this->assertTrue($mutex->create($event, $time));
        $this->assertFalse($mutex->create($event, $time));
        $this->assertTrue($mutex->exists($event, $time));
    }
}
