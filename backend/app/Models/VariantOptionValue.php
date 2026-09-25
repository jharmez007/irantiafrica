<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $product_id
 * @property string $variant_id
 * @property string $option_id
 * @property string $option_value_id
 */
class VariantOptionValue extends Model
{
    use HasUuids;

    protected $fillable = ['product_id', 'variant_id', 'option_id', 'option_value_id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [];
    }
}
