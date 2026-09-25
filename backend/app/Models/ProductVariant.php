<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property string $product_id
 * @property string $sku
 * @property string $option_signature
 * @property string $unit_price_minor
 * @property string $currency
 * @property string $status
 * @property int $price_version
 * @property CarbonImmutable|null $archived_at
 * @property Inventory|null $inventory
 */
class ProductVariant extends Model
{
    use HasUuids;

    protected $fillable = ['product_id', 'sku', 'option_signature', 'unit_price_minor', 'currency', 'status', 'price_version', 'archived_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['unit_price_minor' => 'string', 'price_version' => 'integer', 'archived_at' => 'immutable_datetime'];
    }

    /** @return HasMany<VariantOptionValue, $this> */
    public function selections(): HasMany
    {
        return $this->hasMany(VariantOptionValue::class, 'variant_id')->orderBy('option_id');
    }

    /** @return HasOne<Inventory, $this> */
    public function inventory(): HasOne
    {
        return $this->hasOne(Inventory::class, 'variant_id');
    }

    public function isAvailable(): bool
    {
        return $this->status === 'active' && $this->inventory !== null && $this->inventory->on_hand > $this->inventory->reserved;
    }
}
