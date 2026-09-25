<?php

namespace App\Inventory;

use InvalidArgumentException;

/** Integer-only arithmetic shared by inventory mutations and input validation. */
final class StockMath
{
    public const MAX = 2147483647;

    public static function integer(mixed $value, int $minimum = 1, int $maximum = self::MAX): int
    {
        if (! is_int($value) || $value < $minimum || $value > $maximum) {
            throw new InvalidArgumentException('Quantity must be a whole JSON integer within the permitted range.');
        }

        return $value;
    }

    /** @return array{on_hand:int,reserved:int,available:int} */
    public static function apply(int $onHand, int $reserved, int $onHandDelta, int $reservedDelta): array
    {
        self::integer($onHand, 0);
        self::integer($reserved, 0);
        self::integer($onHandDelta, -self::MAX);
        self::integer($reservedDelta, -self::MAX);
        if ($onHand < $reserved) {
            throw new InventoryConflict('INVENTORY_INTEGRITY_ERROR', 'The current inventory balance needs review.');
        }
        if ($onHandDelta === 0 && $reservedDelta === 0) {
            throw new InvalidArgumentException('A stock movement must change at least one balance.');
        }
        // PostgreSQL integer operands fit safely in the required 64-bit PHP runtime.
        $nextOnHand = $onHand + $onHandDelta;
        $nextReserved = $reserved + $reservedDelta;
        if ($nextOnHand > self::MAX || $nextReserved > self::MAX) {
            throw new InventoryConflict('STOCK_LIMIT_EXCEEDED', 'The resulting quantity exceeds the supported stock limit.');
        }
        if ($nextOnHand < 0 || $nextReserved < 0 || $nextReserved > $nextOnHand) {
            throw new InventoryConflict('INSUFFICIENT_STOCK', 'This operation would exceed available stock or affect reserved units.');
        }

        return ['on_hand' => $nextOnHand, 'reserved' => $nextReserved, 'available' => $nextOnHand - $nextReserved];
    }
}
