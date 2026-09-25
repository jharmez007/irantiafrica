<?php

namespace App\Catalog;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Eloquent\Builder;

final class CatalogRead
{
    /** @return Builder<Product> */
    public static function query(bool $admin = false, bool $browse = true): Builder
    {
        $q = Product::query()->with(['categories', 'options.values', 'variants.selections', 'variants.inventory', 'media']);
        if (! $admin) {
            $q->where('status', 'published')->whereHas('variants', fn (Builder $v) => $v->where('status', 'active'))->whereHas('categories', fn (Builder $c) => $c->where('status', 'active'))->whereHas('media', fn (Builder $m) => $m->where('status', 'ready'));
            if ($browse) {
                $q->whereHas('variants', fn (Builder $v) => self::availableVariant($v));
            }
        }

        return $q;
    }

    /**
     * @param  Builder<Product>  $q
     * @param  array<string,mixed>  $filters
     * @return Builder<Product>
     */
    public static function filter(Builder $q, array $filters, bool $availablePrices = true): Builder
    {
        if (! empty($filters['q'])) {
            $q->whereRaw("to_tsvector('simple', name || ' ' || slug) @@ plainto_tsquery('simple', ?)", [$filters['q']]);
        }
        if (isset($filters['category'])) {
            $q->whereHas('categories', fn (Builder $c) => $c->where('slug', $filters['category'])->where('status', 'active'));
        }
        $q->withMin(['variants as minimum_price' => fn (Builder $v) => $availablePrices ? self::availableVariant($v) : $v->where('status', 'active')], 'unit_price_minor');
        if (isset($filters['min_price']) || isset($filters['max_price'])) {
            $q->whereHas('variants', function (Builder $v) use ($filters, $availablePrices): void {
                $v->where('status', 'active');
                if ($availablePrices) {
                    self::availableVariant($v);
                }
                if (isset($filters['min_price'])) {
                    $v->where('unit_price_minor', '>=', $filters['min_price']);
                } if (isset($filters['max_price'])) {
                    $v->where('unit_price_minor', '<=', $filters['max_price']);
                }
            });
        }
        match ($filters['sort'] ?? 'newest') {
            'price_asc' => $q->orderBy('minimum_price'), 'price_desc' => $q->orderByDesc('minimum_price'), 'name' => $q->orderBy('name'), default => $q->orderByDesc('published_at'),
        };

        return $q->orderBy('id');
    }

    /**
     * One saleable stock pool per variant; an uninitialized pool is unavailable.
     *
     * @param  Builder<ProductVariant>  $q
     * @return Builder<ProductVariant>
     */
    private static function availableVariant(Builder $q): Builder
    {
        return $q->where('status', 'active')->whereHas('inventory', fn (Builder $inventory) => $inventory->whereColumn('on_hand', '>', 'reserved'));
    }
}
