<?php

namespace App\Jobs;

use App\Communications\NotificationDelivery;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

final class DeliverTransactionalEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public string $id) {}

    public function handle(NotificationDelivery $delivery): void
    {
        $delivery->deliver($this->id);
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function failed(?\Throwable $exception): void
    {
        // Never serialize the provider exception into our logs. Scheduler fences expired SENDING.
        Log::warning('notification_job_failed', ['notification_id' => $this->id, 'error_code' => 'JOB_EXHAUSTED']);
    }
}
