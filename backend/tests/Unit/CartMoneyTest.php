<?php

namespace Tests\Unit;

use App\Cart\CartConflict;
use App\Cart\CartMoney;
use PHPUnit\Framework\TestCase;

final class CartMoneyTest extends TestCase
{
    public function test_exact_kobo_and_values_beyond_javascript_safe_integer(): void
    {
        $this->assertSame(3003, CartMoney::line('1001', 3));
        $this->assertSame('9007199254740993', (string) CartMoney::line('9007199254740993', 1));
        $this->assertSame(3005, CartMoney::add(3003, 2));
    }

    public function test_multiplication_overflow_is_rejected_before_float_conversion(): void
    {
        $this->expectException(CartConflict::class);
        CartMoney::line((string) PHP_INT_MAX, 2);
    }

    public function test_sum_overflow_is_rejected(): void
    {
        $this->expectException(CartConflict::class);
        CartMoney::add(PHP_INT_MAX, 1);
    }
}
