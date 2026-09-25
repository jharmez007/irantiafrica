<?php

namespace App\Jobs;

use App\Payments\PaymentService;
use App\Payments\WebhookInbox;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

final class ReconcilePayment implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public string $id, public bool $webhook = false) {}

    public function handle(PaymentService $payments, WebhookInbox $inbox): void
    {
        if ($this->webhook) {
            $inbox->process($this->id);
        } else {
            $payments->verify($this->id, 'scheduler');
        }
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900];
    }
}
