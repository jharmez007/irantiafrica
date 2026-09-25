<?php

namespace App\Payments;

final readonly class Verification
{
    public function __construct(public string $state, public string $reference, public ?string $transactionId = null, public ?string $amount = null, public ?string $currency = null, public ?string $channel = null, public ?string $mode = null, public int $retryAfter = 0) {}

    /** @return array<string,string|null> */
    public function evidence(): array
    {
        return ['state' => $this->state, 'reference' => $this->reference, 'transaction_id' => $this->transactionId, 'amount' => $this->amount, 'currency' => $this->currency, 'channel' => $this->channel, 'mode' => $this->mode];
    }
}
