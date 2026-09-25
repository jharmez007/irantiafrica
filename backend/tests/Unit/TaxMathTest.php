<?php

namespace Tests\Unit;

use App\Checkout\TaxMath;
use PHPUnit\Framework\TestCase;

final class TaxMathTest extends TestCase
{
    public function test_approved_half_up_examples_and_exact_bigint(): void
    {
        foreach ([[1000, '0.1', 100], [1004, '0.1', 100], [1005, '0.1', 101], [1006, '0.1', 101], [1005, '0', 0], [505, '0.1', 51], [PHP_INT_MAX, '1', PHP_INT_MAX], [9007199254740993, '0.1', 900719925474099]] as [$base,$rate,$expected]) {
            $this->assertSame($expected, TaxMath::tax($base, $rate));
        }
        $this->assertSame(202, TaxMath::tax(1005, '0.1') + TaxMath::tax(1005, '0.1'));
        $this->assertSame(2768, 2010 + 202 + 505 + TaxMath::tax(505, '0.1'));
    }

    public function test_historical_allocation_preserves_every_kobo(): void
    {
        foreach ([[101, 3], [11251, 3], [0, 99], [PHP_INT_MAX, 99]] as [$tax,$quantity]) {
            $a = TaxMath::allocation($tax, $quantity);
            $this->assertSame($tax, (int) $a['base_minor'] * $quantity + $a['extra_units']);
            $this->assertLessThan($quantity, $a['extra_units']);
            $this->assertSame($a, TaxMath::allocation($tax, $quantity));
        }
        $this->assertSame(['base_minor' => '3750', 'extra_units' => 1, 'quantity' => 3], TaxMath::allocation(11251, 3));
    }

    public function test_invalid_rates_and_rounding_are_not_coerced(): void
    {
        foreach (['-0.1', '1.1', '1e-1', 'NaN', '.1', '0.1234567890', 0.1, 1, null, ' 0.1'] as $rate) {
            try {
                TaxMath::tax(100, $rate);
                $this->fail('Accepted invalid rate');
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(\InvalidArgumentException::class);
        TaxMath::tax(100, '0.1', 'HALF_EVEN');
    }
}
