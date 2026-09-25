<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $name
 * @property string $slug
 * @property string $status
 * @property string|null $parent_id
 */
class Category extends Model
{
    use HasUuids;

    protected $fillable = ['parent_id', 'name', 'slug', 'status'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [];
    }
}
