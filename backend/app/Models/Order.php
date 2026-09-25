<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $public_reference
 * @property string $checkout_id
 * @property string|null $user_id
 * @property string $source_cart_id
 * @property int $source_cart_version
 * @property string $inventory_reference_id
 * @property string $current_reservation_id
 * @property string $contact_email
 * @property string $status
 * @property string $payment_state
 * @property bool $financial_hold
 * @property CarbonImmutable|null $paid_at
 * @property CarbonImmutable|null $processing_at
 * @property int $version
 * @property string $currency
 * @property string $subtotal_minor
 * @property string $product_tax_minor
 * @property string $delivery_minor
 * @property string $delivery_tax_minor
 * @property string $tax_minor
 * @property string $total_minor
 * @property array<string,mixed> $calculation
 * @property string $configuration_id
 * @property string $fingerprint
 * @property string $creation_scope
 * @property string $creation_key
 * @property string $creation_hash
 * @property string|null $guest_token_hash
 * @property CarbonImmutable|null $guest_expires_at
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable|null $cancelled_at
 */
class Order extends Model
{
    use HasUuids;

    protected $guarded = ['*'];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    protected function casts(): array
    {
        return ['processing_at' => 'immutable_datetime', 'financial_hold' => 'boolean', 'paid_at' => 'immutable_datetime', 'source_cart_version' => 'integer', 'version' => 'integer', 'subtotal_minor' => 'string', 'product_tax_minor' => 'string', 'delivery_minor' => 'string', 'delivery_tax_minor' => 'string', 'tax_minor' => 'string', 'total_minor' => 'string', 'calculation' => 'array', 'guest_expires_at' => 'immutable_datetime', 'created_at' => 'immutable_datetime', 'cancelled_at' => 'immutable_datetime'];
    }
}
