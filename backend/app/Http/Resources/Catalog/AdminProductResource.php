<?php

namespace App\Http\Resources\Catalog;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Product */
class AdminProductResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $catalog = (new PublicProductResource($this->resource))->toArray($request);
        unset($catalog['available']);

        return array_merge($catalog, [
            'id' => $this->id, 'status' => $this->status, 'tax_category_code' => $this->tax_category_code, 'content_version' => $this->content_version,
            'category_ids' => $this->categories->map(fn (Category $c): string => $c->id)->values(),
            'variants' => $this->variants->map(fn (ProductVariant $v): array => ['id' => $v->id, 'sku' => $v->sku, 'unit_price_minor' => $v->unit_price_minor, 'currency' => $v->currency, 'status' => $v->status, 'price_version' => $v->price_version, 'option_value_ids' => $v->selections->pluck('option_value_id')->values()])->values(),
            'media' => $this->media->map(fn (ProductMedia $m): array => array_merge(PublicProductResource::image($m, false), ['status' => $m->status]))->values(),
        ]);
    }
}
