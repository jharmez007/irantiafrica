<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $product_id
 * @property string $name
 * @property int $position
 */
class ProductOption extends Model
{
    use HasUuids;

    protected $fillable = ['product_id', 'name', 'position'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    /** @return HasMany<OptionValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(OptionValue::class, 'option_id')->orderBy('position')->orderBy('id');
    }
}
