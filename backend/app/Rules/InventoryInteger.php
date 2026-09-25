<?php

namespace App\Rules;

use App\Inventory\StockMath;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use InvalidArgumentException;

final class InventoryInteger implements ValidationRule
{
    public function __construct(private int $minimum = 1, private bool $nonzero = false) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        try {
            StockMath::integer($value, $this->minimum);
            if ($this->nonzero && $value === 0) {
                throw new InvalidArgumentException('Zero is not a stock adjustment.');
            }
        } catch (InvalidArgumentException) {
            $fail('The :attribute must be a valid whole-number quantity'.($this->nonzero ? ' other than zero.' : '.'));
        }
    }
}
