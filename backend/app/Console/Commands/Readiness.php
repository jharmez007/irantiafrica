<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

final class Readiness extends Command
{
    protected $signature = 'app:readiness';

    protected $description = 'Private process readiness; no credentials, addresses or provider calls';

    public function handle(): int
    {
        $healthy = true;
        foreach (['postgresql' => fn () => DB::selectOne('SELECT 1'), 'redis_queue' => fn () => Redis::connection('default')->ping(), 'redis_cache' => fn () => Redis::connection('cache')->ping()] as $name => $check) {
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
