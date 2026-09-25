<?php

namespace Tests\Unit;

use App\Inventory\InventoryConflict;
use App\Inventory\StockMath;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class StockMathTest extends TestCase
{
    public function test_reserving_releasing_and_consuming_have_distinct_balance_effects(): void
    {
        $this->assertSame(['on_hand' => 5, 'reserved' => 3, 'available' => 2], StockMath::apply(5, 1, 0, 2));
        $this->assertSame(['on_hand' => 5, 'reserved' => 1, 'available' => 4], StockMath::apply(5, 3, 0, -2));
        $this->assertSame(['on_hand' => 3, 'reserved' => 1, 'available' => 2], StockMath::apply(5, 3, -2, -2));
    }

    public function test_adjustments_cannot_remove_reserved_units_or_underflow(): void
    {
        foreach ([[5, 3, -3, 0], [1, 0, -2, 0], [5, 1, 0, -2]] as $arguments) {
            try {
                StockMath::apply(...$arguments);
                $this->fail('Invalid balance change accepted.');
            } catch (InventoryConflict $exception) {
                $this->assertSame('INSUFFICIENT_STOCK', $exception->inventoryCode);
            }
        }
    }

    public function test_postgresql_integer_boundary_and_overflow_are_explicit(): void
    {
        $this->assertSame(StockMath::MAX, StockMath::apply(StockMath::MAX - 1, 0, 1, 0)['on_hand']);
        $this->expectException(InventoryConflict::class);
        StockMath::apply(StockMath::MAX, 0, 1, 0);
    }

    public function test_quantity_coercions_and_zero_movements_are_rejected(): void
    {
        foreach (['1', '1e3', 1.5, true, null, 0, -1, 2147483648] as $value) {
            try {
                StockMath::integer($value);
                $this->fail('Invalid quantity accepted.');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(InvalidArgumentException::class);
        StockMath::apply(1, 0, 0, 0);
    }
}
