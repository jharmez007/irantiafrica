<?php

namespace Tests\Fixtures;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

final class FoundationProbe implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public string $key, public bool $fail = false) {}

    public function handle(): void
    {
        if ($this->fail) {
            throw new RuntimeException('Intentional harmless foundation queue failure.');
        }
        Cache::store('redis')->put($this->key, 'processed', 60);
    }
}
