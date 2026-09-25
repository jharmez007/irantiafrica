<?php

namespace App\Cart;

use InvalidArgumentException;

/** Checked signed-bigint arithmetic; no float conversion or browser price input. */
final class CartMoney
{
    public static function line(string $price, int $quantity): int
    {
        if (! preg_match('/^(0|[1-9][0-9]{0,18})$/D', $price) || $quantity < 1
            || (strlen($price) === 19 && strcmp($price, (string) PHP_INT_MAX) > 0)) {
            throw new InvalidArgumentException('Invalid price or quantity.');
        }
        $value = (int) $price;
        if ($value > intdiv(PHP_INT_MAX, $quantity)) {
            throw new CartConflict('CART_TOTAL_LIMIT', 'This cart exceeds the supported amount. Reduce its quantity.');
        }

        return $value * $quantity;
    }

    public static function add(int $total, int $line): int
    {
        if ($line < 0 || $total < 0 || $total > PHP_INT_MAX - $line) {
            throw new CartConflict('CART_TOTAL_LIMIT', 'This cart exceeds the supported amount. Reduce its quantity.');
        }

        return $total + $line;
    }
}
