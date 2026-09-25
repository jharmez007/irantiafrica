<?php

namespace App\Cart;

use Symfony\Component\HttpKernel\Exception\HttpException;

final class CartConflict extends HttpException
{
    public function __construct(public readonly string $cartCode, string $message)
    {
        parent::__construct(409, $message);
    }
}
