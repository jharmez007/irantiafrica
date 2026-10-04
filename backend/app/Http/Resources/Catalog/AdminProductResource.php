<?php

namespace App\Http\Resources\Catalog;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogDeletion;
use App\Catalog\CatalogTax;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin Product */
class AdminProductResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        $catalog = (new PublicProductResource($this->resource))->toArray($request);
        unset($catalog['available']);

        return array_merge($catalog, [
            'tax_treatment_label' => collect(app(CatalogTax::class)->choices()['data'])->firstWhere('code', $this->tax_category_code)['label'] ?? null,
            'updated_at' => $this->updated_at?->toIso8601String(),
            'publication_issues' => app(CatalogActions::class)->publicationIssues($this->resource),
            'delete_eligibility' => Gate::allows('catalog.products.delete') ? app(CatalogDeletion::class)->productEligibility($this->resource) : null,
            'id' => $this->id, 'status' => $this->status, 'tax_category_code' => $this->tax_category_code, 'content_version' => $this->content_version,
            'category_ids' => $this->categories->map(fn (Category $c): string => $c->id)->values(),
            'variants' => $this->variants->map(fn (ProductVariant $v): array => ['id' => $v->id, 'sku' => $v->sku, 'unit_price_minor' => $v->unit_price_minor, 'currency' => $v->currency, 'status' => $v->status, 'price_version' => $v->price_version, 'inventory' => $v->inventory ? ['on_hand' => $v->inventory->on_hand, 'reserved' => $v->inventory->reserved, 'available' => $v->inventory->available()] : null, 'option_value_ids' => $v->selections->pluck('option_value_id')->values()])->values(),
            'media' => $this->media->map(fn (ProductMedia $m): array => array_merge(PublicProductResource::image($m, false), ['status' => $m->status]))->values(),
        ]);
    }
}
