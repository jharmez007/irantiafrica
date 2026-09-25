<?php

namespace App\Cart;

final readonly class CartResult
{
    /** @param array<string,mixed> $data */
    public function __construct(public array $data, public ?string $guestToken = null, public bool $forgetGuest = false) {}
}
