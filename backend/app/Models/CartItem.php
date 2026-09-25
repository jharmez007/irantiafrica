<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $cart_id
 * @property string $variant_id
 * @property int $quantity
 */
class CartItem extends Model
{
    use HasUuids;

    protected $guarded = ['*'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }
}
