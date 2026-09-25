<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $product_id
 * @property string $option_id
 * @property string $value
 * @property int $position
 */
class OptionValue extends Model
{
    use HasUuids;

    protected $fillable = ['product_id', 'option_id', 'value', 'position'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['position' => 'integer'];
    }
}
