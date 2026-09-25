<?php

namespace App\Jobs;

use App\Returns\RefundService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

final class ReconcileRefund implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public string $id) {}

    public function handle(RefundService $refunds): void
    {
        $refunds->verify($this->id);
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900];
    }
}
