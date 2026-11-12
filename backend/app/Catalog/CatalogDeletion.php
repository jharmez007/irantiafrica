<?php

namespace App\Catalog;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Product recovery lifecycle and retention-safe catalogue tombstoning. */
final class CatalogDeletion
{
    public const CATEGORY_BLOCKED = 'This category cannot be deleted while products are assigned to it.';

    public function __construct(private CatalogActions $actions) {}

    /** @return array{allowed:bool,code:?string,reason:?string} */
    public function purgeEligibility(Product $product): array
    {
        if ($product->removed_at === null) {
            return ['allowed' => false, 'code' => 'NOT_RECYCLED', 'reason' => 'Move this product to the Recycle Bin before permanently removing it.'];
        }
        if ($product->purge_status === 'completed') {
            return ['allowed' => false, 'code' => 'ALREADY_REMOVED', 'reason' => 'This product has already been permanently removed from the catalogue.'];
        }
        $variantIds = ProductVariant::where('product_id', $product->id)->pluck('id');
        if ($variantIds->isNotEmpty()) {
            $stock = DB::table('inventory')->whereIn('variant_id', $variantIds)
                ->selectRaw('COALESCE(SUM(on_hand), 0) AS on_hand, COALESCE(SUM(reserved), 0) AS reserved')->first();
            if ((int) ($stock->reserved ?? 0) > 0 || DB::table('reservation_items as ri')
                ->join('reservations as r', 'r.id', '=', 'ri.reservation_id')
                ->whereIn('ri.variant_id', $variantIds)->where('r.status', 'ACTIVE')->exists()) {
                return ['allowed' => false, 'code' => 'ACTIVE_RESERVATIONS', 'reason' => 'Active stock reservations must finish or expire before permanent catalogue removal.'];
            }
            if ((int) ($stock->on_hand ?? 0) > 0) {
                return ['allowed' => false, 'code' => 'PHYSICAL_STOCK_REMAINS', 'reason' => 'Physical stock remains. Record an authorized stock disposition before permanent catalogue removal.'];
            }
        }

        return ['allowed' => true, 'code' => null, 'reason' => null];
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

    public function recycle(string $id, int $expectedVersion, User $actor): Product
    {
        return DB::transaction(function () use ($id, $expectedVersion, $actor): Product {
            $this->actions->lock();
            $product = Product::whereKey($id)->lockForUpdate()->firstOrFail();
            ProductVariant::where('product_id', $id)->orderBy('id')->lockForUpdate()->get();
            if ($product->removed_at !== null && $product->purge_status !== 'completed') {
                return $product;
            }
            abort_if($product->content_version !== $expectedVersion || $product->purge_status === 'completed', 409);
            $before = $product->only(['status', 'content_version']);
            $removedAt = now()->toImmutable();
            $product->forceFill([
                'removed_at' => $removedAt,
                'removed_by_user_id' => $actor->id,
                'recycle_expires_at' => $removedAt->addDays((int) config('catalog.recycle_days')),
                'purge_status' => 'recoverable',
                'purge_block_code' => null,
                'purge_block_reason' => null,
                'purge_completed_at' => null,
                'content_version' => $product->content_version + 1,
            ])->save();
            CatalogAudit::record('product_recycled', 'product', $id, [
                'before' => $before,
                'after' => $product->only(['status', 'content_version', 'removed_at', 'recycle_expires_at', 'purge_status']),
            ]);

            return $product;
        });
    }

    /** @return array{product:Product,restored_as_draft:bool,publication_issues:list<string>} */
    public function restoreRemoval(string $id, int $expectedVersion): array
    {
        return DB::transaction(function () use ($id, $expectedVersion): array {
            $this->actions->lock();
            $product = Product::whereKey($id)->lockForUpdate()->firstOrFail();
            ProductVariant::where('product_id', $id)->orderBy('id')->lockForUpdate()->get();
            abort_if(
                $product->content_version !== $expectedVersion
                || $product->removed_at === null
                || $product->purge_status === 'completed'
                || ($product->recycle_expires_at !== null && $product->recycle_expires_at->isPast()),
                409,
            );
            $before = $product->only(['status', 'content_version', 'removed_at', 'recycle_expires_at', 'purge_status']);
            $issues = [];
            $restoredAsDraft = false;
            if ($product->status === 'published') {
                $product->load(['categories', 'media', 'variants.selections', 'options']);
                $issues = $this->actions->publicationIssues($product);
                if ($issues !== []) {
                    $product->status = 'draft';
                    $product->archived_at = null;
                    $restoredAsDraft = true;
                }
            }
            $product->forceFill([
                'removed_at' => null,
                'removed_by_user_id' => null,
                'recycle_expires_at' => null,
                'purge_status' => null,
                'purge_block_code' => null,
                'purge_block_reason' => null,
                'purge_completed_at' => null,
                'content_version' => $product->content_version + 1,
            ])->save();
            CatalogAudit::record('product_recycle_restored', 'product', $id, [
                'before' => $before,
                'after' => $product->only(['status', 'content_version']),
                'restored_as_draft' => $restoredAsDraft,
                'publication_issues' => $issues,
            ]);

            return ['product' => $product, 'restored_as_draft' => $restoredAsDraft, 'publication_issues' => $issues];
        });
    }

    /** @return array{outcome:string,product:Product,code:?string,reason:?string} */
    public function purge(string $id, ?int $expectedVersion = null, bool $automatic = false): array
    {
        return DB::transaction(function () use ($id, $expectedVersion, $automatic): array {
            $this->actions->lock();
            $product = Product::whereKey($id)->lockForUpdate()->firstOrFail();
            ProductVariant::where('product_id', $id)->orderBy('id')->lockForUpdate()->get();
            if ($product->purge_status === 'completed') {
                return ['outcome' => 'completed', 'product' => $product, 'code' => null, 'reason' => null];
            }
            abort_if($product->removed_at === null || ($expectedVersion !== null && $product->content_version !== $expectedVersion), 409);
            if ($automatic && ($product->recycle_expires_at === null || $product->recycle_expires_at->isFuture())) {
                return ['outcome' => 'not_due', 'product' => $product, 'code' => 'NOT_DUE', 'reason' => 'The recovery period has not ended.'];
            }
            CatalogAudit::record('product_purge_requested', 'product', $id, ['automatic' => $automatic]);
            $eligibility = $this->purgeEligibility($product);
            if (! $eligibility['allowed']) {
                $product->forceFill([
                    'purge_status' => 'blocked',
                    'purge_block_code' => $eligibility['code'],
                    'purge_block_reason' => $eligibility['reason'],
                    'content_version' => $product->content_version + 1,
                ])->save();
                CatalogAudit::record('product_purge_blocked', 'product', $id, [
                    'automatic' => $automatic,
                    'code' => $eligibility['code'],
                    'reason' => $eligibility['reason'],
                ], 'blocked', $eligibility['reason']);

                return ['outcome' => 'blocked', 'product' => $product, 'code' => $eligibility['code'], 'reason' => $eligibility['reason']];
            }
            $now = now()->toImmutable();
            ProductMedia::where('product_id', $id)->whereNotIn('status', ['retired'])->update(['status' => 'retired', 'retired_at' => $now, 'updated_at' => $now]);
            $product->forceFill([
                'purge_status' => 'completed',
                'purge_block_code' => null,
                'purge_block_reason' => null,
                'purge_completed_at' => $now,
                'content_version' => $product->content_version + 1,
            ])->save();
            CatalogAudit::record('product_purge_completed', 'product', $id, [
                'automatic' => $automatic,
                'retention' => 'catalogue_tombstone',
                'media_retired' => ProductMedia::where('product_id', $id)->count(),
            ]);

            return ['outcome' => 'completed', 'product' => $product, 'code' => null, 'reason' => null];
        });
    }

    public function recordPurgeFailure(string $id): void
    {
        DB::transaction(function () use ($id): void {
            $this->actions->lock();
            $product = Product::whereKey($id)->whereNull('purge_completed_at')->lockForUpdate()->first();
            if ($product === null || $product->removed_at === null) {
                return;
            }
            $reason = 'Automatic removal could not be completed. The scheduler will retry; review application monitoring for details.';
            $product->forceFill([
                'purge_status' => 'blocked',
                'purge_block_code' => 'PROCESSING_FAILURE',
                'purge_block_reason' => $reason,
                'content_version' => $product->content_version + 1,
            ])->save();
            CatalogAudit::record('product_purge_failed', 'product', $id, ['code' => 'PROCESSING_FAILURE'], 'failure', $reason);
        });
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
        } catch (QueryException $exception) {
            if ($exception->getCode() !== '23503') {
                throw $exception;
            }
            throw ValidationException::withMessages(['category' => self::CATEGORY_BLOCKED]);
        }
    }
}
