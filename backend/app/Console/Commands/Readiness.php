<?php

namespace App\Console\Commands;

use App\Support\DeploymentProfile;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schema;

final class Readiness extends Command
{
    protected $signature = 'app:readiness';

    protected $description = 'Private process readiness; no credentials, addresses or provider calls';

    public function handle(): int
    {
        if (DeploymentProfile::isFreeTest()) {
            $this->warn('EPHEMERAL MEDIA STORAGE ACTIVE — TEST ENVIRONMENT ONLY — MEDIA MAY BE LOST ON REDEPLOY OR RESTART');
        }
        $healthy = true;
        $cacheStore = (string) config('cache.default');
        $cacheCheck = $cacheStore === 'database'
            ? function (): void {
                $key = 'readiness:'.bin2hex(random_bytes(8));
                Cache::store('database')->put($key, 'ok', 30);
                try {
                    if (Cache::store('database')->get($key) !== 'ok') {
                        throw new \RuntimeException('Database cache probe mismatch.');
                    }
                } finally {
                    Cache::store('database')->forget($key);
                }
            }
        : fn () => Redis::connection('cache')->ping();
        $queueCheck = config('queue.default') === 'database'
            ? function (): void {
                if (! Schema::hasTable('jobs')) {
                    throw new \RuntimeException('Database queue table missing.');
                }
                DB::table('jobs')->limit(1)->exists();
            }
        : fn () => Redis::connection('default')->ping();
        $checks = [
            'postgresql' => fn () => DB::selectOne('SELECT 1'),
            config('queue.default') === 'database' ? 'database_queue' : 'redis_queue' => $queueCheck,
            $cacheStore === 'database' ? 'database_cache' : 'redis_cache' => $cacheCheck,
        ];
        foreach ($checks as $name => $check) {
            try {
                $check();
                $this->line($name.': OK');
            } catch (\Throwable) {
                $healthy = false;
                $this->error($name.': UNAVAILABLE');
            }
        }
        $this->line('Provider and object-store availability are separate operational checks.');

        return $healthy ? self::SUCCESS : self::FAILURE;
    }
}
