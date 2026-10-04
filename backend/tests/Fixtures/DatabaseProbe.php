<?php

namespace Tests\Fixtures;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

final class DatabaseProbe implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 0;

    public function __construct(public string $key, public int $failUntil = 0) {}

    public function handle(): void
    {
        $cache = Cache::store('database');
        $attempt = (int) $cache->get($this->key.':attempts', 0) + 1;
        $cache->put($this->key.':attempts', $attempt, 60);
        if ($attempt <= $this->failUntil) {
            throw new RuntimeException('Intentional database queue probe failure.');
        }
        $cache->put($this->key.':processed', true, 60);
    }
}
