<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $variant_id
 * @property int $on_hand
 * @property int $reserved
 * @property int $low_stock_threshold
 * @property string $version
 */
class Inventory extends Model
{
    use HasUuids;

    protected $table = 'inventory';

    // All writes belong to InventoryService; no mass-assignment surface.
    protected $guarded = ['*'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['on_hand' => 'integer', 'reserved' => 'integer', 'low_stock_threshold' => 'integer', 'version' => 'string'];
    }

    public function available(): int
    {
        return $this->on_hand - $this->reserved;
    }
}
