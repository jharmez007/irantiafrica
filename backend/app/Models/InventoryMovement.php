<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $variant_id
 * @property string|null $reservation_item_id
 * @property string|null $actor_user_id
 * @property string $operation_key
 * @property string $kind
 * @property int $on_hand_delta
 * @property int $reserved_delta
 * @property int $on_hand_after
 * @property int $reserved_after
 * @property string $reason
 * @property CarbonImmutable $created_at
 */
class InventoryMovement extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $guarded = ['*'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['on_hand_delta' => 'integer', 'reserved_delta' => 'integer', 'on_hand_after' => 'integer', 'reserved_after' => 'integer', 'created_at' => 'immutable_datetime'];
    }
}
