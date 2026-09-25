<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $name
 * @property string $slug
 * @property string $description
 * @property string $kind
 * @property string $status
 * @property string $tax_category_code
 * @property int $content_version
 * @property CarbonImmutable|null $published_at
 * @property CarbonImmutable|null $archived_at
 */
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory;

    use HasUuids;

    protected $fillable = ['name', 'slug', 'description', 'kind', 'status', 'tax_category_code', 'content_version', 'published_at', 'archived_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['content_version' => 'integer', 'published_at' => 'immutable_datetime', 'archived_at' => 'immutable_datetime'];
    }

    /** @return HasMany<ProductVariant, $this> */
    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('id');
    }

    /** @return HasMany<ProductOption, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(ProductOption::class)->orderBy('position')->orderBy('id');
    }

    /** @return HasMany<ProductMedia, $this> */
    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class)->orderBy('position')->orderBy('id');
    }

    /** @return BelongsToMany<Category, $this> */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'product_categories')->withTimestamps()->orderBy('slug');
    }
}
