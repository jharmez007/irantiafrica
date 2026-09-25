<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $product_id
 * @property string $object_key
 * @property string $status
 * @property string $alt_text
 * @property string|null $variant_id
 * @property string|null $mime_type
 * @property string|null $checksum
 * @property int|null $byte_size
 * @property int|null $width
 * @property int|null $height
 * @property int $position
 * @property array<string, array{key:string,width:int,height:int}> $derivatives
 * @property CarbonImmutable|null $retired_at
 */
class ProductMedia extends Model
{
    use HasUuids;

    protected $fillable = ['product_id', 'variant_id', 'object_key', 'derivatives', 'status', 'mime_type', 'byte_size', 'width', 'height', 'checksum', 'alt_text', 'position', 'retired_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['derivatives' => 'array', 'position' => 'integer', 'byte_size' => 'integer', 'width' => 'integer', 'height' => 'integer', 'retired_at' => 'immutable_datetime'];
    }
}
