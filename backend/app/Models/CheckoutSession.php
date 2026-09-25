<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string|null $user_id
 * @property string|null $guest_token_hash
 * @property string|null $cart_id
 * @property string $source_cart_id
 * @property int $cart_version
 * @property string $creation_key
 * @property string $creation_hash
 * @property string $status
 * @property int $version
 * @property string|null $configuration_id
 * @property string|null $inventory_reference_id
 * @property string|null $current_reservation_id
 * @property string|null $reserve_key
 * @property string|null $reserve_hash
 * @property string $subtotal_minor
 * @property string|null $tax_minor
 * @property string|null $delivery_minor
 * @property string|null $total_minor
 * @property array<string,mixed>|null $calculation
 * @property string|null $fingerprint
 * @property CarbonImmutable|null $promoted_at
 * @property CarbonImmutable $expires_at
 */
class CheckoutSession extends Model
{
    use HasUuids;

    protected $guarded = ['*'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected function casts(): array
    {
        return ['promoted_at' => 'immutable_datetime', 'cart_version' => 'integer', 'version' => 'integer', 'subtotal_minor' => 'string', 'tax_minor' => 'string', 'delivery_minor' => 'string', 'total_minor' => 'string', 'calculation' => 'array', 'expires_at' => 'immutable_datetime'];
    }
}
