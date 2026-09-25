<?php

namespace App\Checkout;

use Symfony\Component\HttpKernel\Exception\HttpException;

final class CheckoutConflict extends HttpException
{
    /** @param array<string,mixed> $details */
    public function __construct(public readonly string $checkoutCode, string $message, public readonly array $details = [])
    {
        parent::__construct(409, $message);
    }
}
