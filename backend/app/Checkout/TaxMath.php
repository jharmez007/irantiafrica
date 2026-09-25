<?php

namespace App\Checkout;

use InvalidArgumentException;

final class TaxMath
{
    /** Exact fractional rate 0..1, at most nine decimal places. Never coerces floats. */
    public static function numerator(mixed $rate): int
    {
        if (! is_string($rate) || ! preg_match('/^(?:0(?:\.[0-9]{1,9})?|1(?:\.0{1,9})?)$/D', $rate)) {
            throw new InvalidArgumentException('Tax rate must be an exact fractional decimal string from zero to one.');
        }
        [$whole, $fraction] = array_pad(explode('.', $rate, 2), 2, '');

        return (int) $whole * 1000000000 + (int) str_pad($fraction, 9, '0');
    }

    public static function tax(int $base, mixed $rate, string $rounding = 'HALF_UP'): int
    {
        if ($base < 0 || $rounding !== 'HALF_UP') {
            throw new InvalidArgumentException('Invalid tax basis or rounding mode.');
        }
        $n = self::numerator($rate);
        // Quotient/remainder decomposition bounds each multiplication below signed bigint.
        $whole = intdiv($base, 1000000000) * $n;
        $fraction = ($base % 1000000000) * $n;

        return $whole + intdiv($fraction + 500000000, 1000000000);
    }

    /**
     * @return array{base_minor:string,extra_units:int,quantity:int} */
    public static function allocation(int $tax, int $quantity): array
    {
        if ($tax < 0 || $quantity < 1) {
            throw new InvalidArgumentException('Invalid historical allocation.');
        }

        return ['base_minor' => (string) intdiv($tax, $quantity), 'extra_units' => $tax % $quantity, 'quantity' => $quantity];
    }
}
