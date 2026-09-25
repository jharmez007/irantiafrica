<?php

namespace App\Http\Resources\Catalog;

use App\Catalog\MediaStorage;
use App\Models\Category;
use App\Models\OptionValue;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductOption;
use App\Models\ProductVariant;
use App\Models\VariantOptionValue;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Product */
class PublicProductResource extends JsonResource
{
    public function __construct(mixed $resource, private bool $availablePrices = false)
    {
        parent::__construct($resource);
    }

    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $variants = $this->variants->where('status', 'active')->values();
        $available = $variants->filter(fn (ProductVariant $v): bool => $v->isAvailable());
        $priced = $this->availablePrices ? $available : $variants;

        return ['slug' => $this->slug, 'name' => $this->name, 'description' => $this->description, 'kind' => $this->kind, 'currency' => 'NGN', 'available' => $available->isNotEmpty(),
            'price_min_minor' => $priced->isEmpty() ? null : (string) $priced->min(fn (ProductVariant $v): int => (int) $v->unit_price_minor),
            'price_max_minor' => $priced->isEmpty() ? null : (string) $priced->max(fn (ProductVariant $v): int => (int) $v->unit_price_minor),
            'categories' => $this->categories->where('status', 'active')->map(fn (Category $c): array => ['name' => $c->name, 'slug' => $c->slug])->values(),
            'options' => $this->options->map(fn (ProductOption $o): array => ['id' => $o->id, 'name' => $o->name, 'values' => $o->values->map(fn (OptionValue $v): array => ['id' => $v->id, 'value' => $v->value])->values()])->values(),
            'variants' => $variants->map(fn (ProductVariant $v): array => ['id' => $v->id, 'sku' => $v->sku, 'unit_price_minor' => $v->unit_price_minor, 'currency' => $v->currency, 'available' => $v->isAvailable(), 'option_value_ids' => $v->selections->map(fn (VariantOptionValue $s): string => $s->option_value_id)->values()]),
            'media' => $this->media->where('status', 'ready')->map(fn (ProductMedia $m): array => self::image($m))->values(),
        ];
    }

    /** @return array<string,mixed> */
    public static function image(ProductMedia $m, bool $public = true): array
    {
        return ['id' => $m->id, 'variant_id' => $m->variant_id, 'alt_text' => $m->alt_text, 'position' => $m->position, 'width' => $m->width, 'height' => $m->height, 'sources' => app(MediaStorage::class)->sources($m, $public)];
    }
}
