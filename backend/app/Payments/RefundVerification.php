<?php

namespace App\Payments;

final readonly class RefundVerification
{
    public function __construct(public string $state, public ?string $providerId = null, public ?string $transactionId = null, public ?string $amount = null, public ?string $currency = null, public ?string $merchantReference = null, public ?string $mode = null) {}
}
