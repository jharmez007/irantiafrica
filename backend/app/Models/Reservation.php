<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Inventory-owned generation; COMMITTED means consumed, not payment authority.
 *
 * @property string $id
 * @property string $reference_id
 * @property int $generation
 * @property string $status
 * @property CarbonImmutable $expires_at
 * @property CarbonImmutable|null $closed_at
 */
class Reservation extends Model
{
    use HasUuids;

    protected $guarded = ['*'];

    // Preserve PostgreSQL wall-clock precision for expiry boundaries.
    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['generation' => 'integer', 'expires_at' => 'immutable_datetime', 'closed_at' => 'immutable_datetime'];
    }
}
