<?php

namespace App\Catalog;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Narrow physical deletion of unused draft catalog records; operational history is never erased. */
final class CatalogDeletion
{
    public const PRODUCT_BLOCKED = 'This product cannot be permanently deleted because it has historical records. Archive it instead.';

    public const CATEGORY_BLOCKED = 'This category cannot be deleted while products are assigned to it.';

    public function __construct(private CatalogActions $actions) {}

    /** @return array{allowed:bool,reason:?string} */
    public function productEligibility(Product $product): array
    {
        if ($product->status !== 'draft') {
            return ['allowed' => false, 'reason' => 'Only unused draft products can be permanently deleted. Archive this product instead.'];
        }
        $ids = ProductVariant::where('product_id', $product->id)->pluck('id');
        if (DB::table('product_media')->where('product_id', $product->id)->exists()) {
            // Private objects and async image jobs have their own lifecycle. Never leave an orphaned file.
            return ['allowed' => false, 'reason' => 'This product has media records. Archive it instead.'];
        }
        foreach (['inventory', 'inventory_movements', 'reservation_items', 'cart_items', 'checkout_lines', 'order_items'] as $table) {
            if ($ids->isNotEmpty() && DB::table($table)->whereIn('variant_id', $ids)->exists()) {
                return ['allowed' => false, 'reason' => self::PRODUCT_BLOCKED];
            }
        }

        return ['allowed' => true, 'reason' => null];
    }

    /** @return array{allowed:bool,reason:?string} */
    public function categoryEligibility(Category $category): array
    {
        if (DB::table('product_categories')->where('category_id', $category->id)->exists()) {
            return ['allowed' => false, 'reason' => self::CATEGORY_BLOCKED];
        }
        if (Category::where('parent_id', $category->id)->exists()) {
            return ['allowed' => false, 'reason' => 'Move or remove child categories before deleting this category.'];
        }

        return ['allowed' => true, 'reason' => null];
    }

    public function product(string $id, int $expectedVersion): void
    {
        try {
            DB::transaction(function () use ($id, $expectedVersion): void {
                $this->actions->lock();
                $product = Product::whereKey($id)->lockForUpdate()->firstOrFail();
                abort_if($product->content_version !== $expectedVersion, 409);
                // Inventory initializes under the variant lock, so hold it while checking references.
                ProductVariant::where('product_id', $id)->lockForUpdate()->get();
                $eligibility = $this->productEligibility($product);
                if (! $eligibility['allowed']) {
                    throw ValidationException::withMessages(['product' => $eligibility['reason']]);
                }
                DB::table('variant_option_values')->where('product_id', $id)->delete();
                DB::table('product_variants')->where('product_id', $id)->delete();
                DB::table('option_values')->where('product_id', $id)->delete();
                DB::table('product_options')->where('product_id', $id)->delete();
                DB::table('product_categories')->where('product_id', $id)->delete();
                $product->delete();
                CatalogAudit::record('product_deleted', 'product', $id, ['name' => $product->name, 'slug' => $product->slug]);
            });
        } catch (QueryException $e) {
            if ($e->getCode() !== '23503') {
                throw $e;
            }
            throw ValidationException::withMessages(['product' => self::PRODUCT_BLOCKED]);
        }
    }

    public function category(string $id): void
    {
        try {
            DB::transaction(function () use ($id): void {
                $this->actions->lock();
                $category = Category::whereKey($id)->lockForUpdate()->firstOrFail();
                $eligibility = $this->categoryEligibility($category);
                if (! $eligibility['allowed']) {
                    throw ValidationException::withMessages(['category' => $eligibility['reason']]);
                }
                $category->delete();
                CatalogAudit::record('category_deleted', 'category', $id, ['name' => $category->name, 'slug' => $category->slug]);
            });
        } catch (QueryException $e) {
            if ($e->getCode() !== '23503') {
                throw $e;
            }
            throw ValidationException::withMessages(['category' => self::CATEGORY_BLOCKED]);
        }
    }
}
