<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string|null $user_id
 * @property string|null $guest_token_hash
 * @property string $status
 * @property int $version
 * @property CarbonImmutable $expires_at
 */
class Cart extends Model
{
    use HasUuids;

    protected $guarded = ['*'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['version' => 'integer', 'expires_at' => 'immutable_datetime'];
    }
}
