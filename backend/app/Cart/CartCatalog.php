<?php

namespace App\Cart;

use App\Catalog\CatalogRead;
use App\Http\Resources\Catalog\PublicProductResource;
use App\Inventory\InventoryService;
use App\Models\Product;
use App\Models\ProductVariant;

/** Bounded bulk read; never writes stock or trusts a cart price snapshot. */
final class CartCatalog
{
    /** @param list<string> $ids
     * @return array<string,array<string,mixed>>
     */
    public function read(array $ids): array
    {
        $variants = ProductVariant::whereIn('id', $ids)->get();
        $productIds = $variants->pluck('product_id')->unique()->all();
        $products = Product::with(['options.values', 'variants.selections', 'media'])->whereIn('id', $productIds)->get()->keyBy('id');
        $eligible = CatalogRead::query(false, false)->whereIn('id', $productIds)->pluck('id')->all();
        $availability = app(InventoryService::class)->availability($ids);
        $result = [];
        foreach ($variants as $variant) {
            $product = $products->get($variant->product_id);
            $sellable = $product !== null && in_array($variant->product_id, $eligible, true) && $variant->status === 'active';
            $options = [];
            $loadedVariant = $product?->variants->firstWhere('id', $variant->id);
            $selected = $loadedVariant?->selections->pluck('option_value_id')->all() ?? [];
            foreach ($product->options ?? [] as $option) {
                foreach ($option->values as $value) {
                    if (in_array($value->id, $selected, true)) {
                        $options[] = $option->name.': '.$value->value;
                    }
                }
            }
            $media = $product?->media->where('status', 'ready')->first(fn ($m) => $m->variant_id === $variant->id)
                ?? $product?->media->where('status', 'ready')->first(fn ($m) => $m->variant_id === null);
            $result[$variant->id] = [
                'name' => $sellable ? $product->name : 'Unavailable item',
                'slug' => $sellable ? $product->slug : null,
                'options' => $sellable ? $options : [],
                'image' => $sellable && $media !== null ? PublicProductResource::image($media) : null,
                'unit_price_minor' => $sellable ? $variant->unit_price_minor : null,
                'sellable' => $sellable,
                'available' => $sellable ? ($availability[$variant->id] ?? 0) : 0,
            ];
        }

        return $result;
    }
}
