<?php

namespace App\Http\Controllers;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogDeletion;
use App\Catalog\CatalogRead;
use App\Catalog\CatalogTax;
use App\Http\Requests\Catalog\CatalogQuery;
use App\Http\Requests\Catalog\CatalogRequest;
use App\Http\Requests\Catalog\RecycleBinQuery;
use App\Http\Resources\Catalog\AdminProductResource;
use App\Http\Resources\Catalog\PublicProductResource;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductOption;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class CatalogController
{
    public function __construct(private CatalogActions $actions, private CatalogDeletion $deletion) {}

    public function taxCategories(): JsonResponse
    {
        Gate::authorize('catalog.create_update');

        return response()->json(app(CatalogTax::class)->choices());
    }

    public function index(CatalogQuery $request): JsonResponse
    {
        return $this->listing($request, false);
    }

    public function adminIndex(CatalogQuery $request): JsonResponse
    {
        Gate::authorize('viewAny', Product::class);

        return $this->listing($request, true);
    }

    private function listing(CatalogQuery $request, bool $admin): JsonResponse
    {
        $data = CatalogRead::filter(CatalogRead::query($admin), $request->validated(), ! $admin)->paginate((int) $request->input('page_size', 24));
        $products = $admin ? AdminProductResource::collection($data)->resolve() : $data->getCollection()->map(fn (Product $product): array => (new PublicProductResource($product, true))->resolve($request));

        return response()->json(['data' => $products, 'meta' => ['page' => $data->currentPage(), 'page_size' => $data->perPage(), 'total' => $data->total(), 'last_page' => $data->lastPage()]]);
    }

    public function show(string $slug): PublicProductResource
    {
        return new PublicProductResource(CatalogRead::query(browse: false)->where('slug', $slug)->firstOrFail());
    }

    public function adminShow(string $id): AdminProductResource
    {
        $p = Product::with(['categories', 'options.values', 'variants.selections', 'variants.inventory', 'media', 'removedBy'])->findOrFail($id);
        abort_if($p->purge_status === 'completed', 404);
        Gate::authorize('view', $p);
        if ($p->removed_at !== null) {
            Gate::authorize('viewRecycleBin', $p);
        }

        return new AdminProductResource($p);
    }

    public function recycleBin(RecycleBinQuery $request): JsonResponse
    {
        Gate::authorize('viewRecycleBin', Product::class);
        $filters = $request->validated();
        $query = Product::query()
            ->with(['categories', 'options.values', 'variants.selections', 'variants.inventory', 'media', 'removedBy'])
            ->whereNotNull('removed_at')->where('purge_status', '<>', 'completed');
        if (! empty($filters['q'])) {
            $term = $filters['q'];
            $query->where(function ($candidate) use ($term): void {
                $candidate->whereRaw("to_tsvector('simple', name || ' ' || slug) @@ plainto_tsquery('simple', ?)", [$term])
                    ->orWhereHas('variants', fn ($variant) => $variant->where('sku', 'ilike', '%'.addcslashes($term, '\\%_').'%'));
            });
        }
        if (isset($filters['previous_status'])) {
            $query->where('status', $filters['previous_status']);
        }
        match ($filters['view'] ?? null) {
            'recent' => $query->where('removed_at', '>=', now()->subDays(7)),
            'expiring' => $query->whereNotNull('recycle_expires_at')->whereBetween('recycle_expires_at', [now(), now()->addDays(7)]),
            'pending' => $query->whereNotNull('recycle_expires_at')->where('recycle_expires_at', '<=', now())->where('purge_status', '<>', 'blocked'),
            'blocked' => $query->where('purge_status', 'blocked'),
            'legacy' => $query->where('purge_status', 'legacy_review'),
            default => null,
        };
        $page = $query->orderByDesc('removed_at')->orderBy('id')->paginate((int) $request->input('page_size', 25));

        return response()->json([
            'data' => AdminProductResource::collection($page->getCollection())->resolve(),
            'meta' => ['page' => $page->currentPage(), 'page_size' => $page->perPage(), 'total' => $page->total(), 'last_page' => $page->lastPage()],
        ]);
    }

    public function createProduct(CatalogRequest $r): JsonResponse
    {
        Gate::authorize('create', Product::class);
        $p = $this->actions->product($r->validated());

        return $this->adminShow($p->id)->response()->setStatusCode(201);
    }

    public function updateProduct(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('update', Product::findOrFail($id));
        $this->actions->product($r->validated(), $id);

        return $this->adminShow($id);
    }

    public function publication(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('publish', Product::findOrFail($id));
        $this->actions->transition($id, (int) $r->validated('content_version'), false);

        return $this->adminShow($id);
    }

    public function archive(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('archive', Product::findOrFail($id));
        $this->actions->transition($id, (int) $r->validated('content_version'), true);

        return $this->adminShow($id);
    }

    public function restore(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('restore', Product::findOrFail($id));
        $this->actions->restore($id, (int) $r->validated('content_version'));

        return $this->adminShow($id);
    }

    public function deleteProduct(CatalogRequest $r, string $id): Response
    {
        Gate::authorize('delete', Product::findOrFail($id));
        $result = $this->deletion->purge($id, (int) $r->validated('content_version'));
        if ($result['outcome'] === 'blocked') {
            throw ValidationException::withMessages(['product' => $result['reason']]);
        }

        return response()->noContent();
    }

    public function removeProduct(CatalogRequest $r, string $id): AdminProductResource
    {
        $product = Product::findOrFail($id);
        Gate::authorize('remove', $product);
        $actor = $r->user();
        abort_unless($actor instanceof User, 401);
        $this->deletion->recycle($id, (int) $r->validated('content_version'), $actor);

        return $this->adminShow($id);
    }

    public function restoreRemovedProduct(CatalogRequest $r, string $id): AdminProductResource
    {
        $product = Product::findOrFail($id);
        Gate::authorize('restoreRemoval', $product);
        $result = $this->deletion->restoreRemoval($id, (int) $r->validated('content_version'));

        return (new AdminProductResource($result['product']->load(['categories', 'options.values', 'variants.selections', 'variants.inventory', 'media', 'removedBy'])))
            ->additional(['meta' => ['restored_as_draft' => $result['restored_as_draft'], 'publication_issues' => $result['publication_issues']]]);
    }

    public function categories(CatalogQuery $r): JsonResponse
    {
        return $this->categoryList($r, false);
    }

    public function categoryShow(string $slug): JsonResponse
    {
        return response()->json(['data' => Category::where('status', 'active')->where('slug', $slug)->firstOrFail()->only(['name', 'slug'])]);
    }

    public function adminCategories(CatalogQuery $r): JsonResponse
    {
        Gate::authorize('catalog.read_internal');

        return $this->categoryList($r, true);
    }

    private function categoryList(CatalogQuery $r, bool $admin): JsonResponse
    {
        $q = Category::query();
        if (! $admin) {
            $q->where('status', 'active');
        }
        $p = $q->orderBy('name')->orderBy('id')->paginate((int) $r->input('page_size', 100));

        return response()->json(['data' => $p->getCollection()->map(function (Category $c) use ($admin): array {
            if (! $admin) {
                return $c->only(['name', 'slug']);
            }
            $data = $c->only(['id', 'name', 'slug', 'parent_id', 'status']);
            if (Gate::allows('catalog.categories.delete')) {
                $data['delete_eligibility'] = $this->deletion->categoryEligibility($c);
            }

            return $data;
        }), 'meta' => ['page' => $p->currentPage(), 'last_page' => $p->lastPage(), 'total' => $p->total()]]);
    }

    public function createCategory(CatalogRequest $r): JsonResponse
    {
        Gate::authorize('catalog.create_update');

        return response()->json(['data' => $this->actions->category($r->validated())->only(['id', 'name', 'slug', 'status', 'parent_id'])], 201);
    }

    public function updateCategory(CatalogRequest $r, string $id): JsonResponse
    {
        Gate::authorize('catalog.create_update');

        return response()->json(['data' => $this->actions->category($r->validated(), $id)->only(['id', 'name', 'slug', 'status', 'parent_id'])]);
    }

    public function deleteCategory(string $id): Response
    {
        Gate::authorize('catalog.categories.delete');
        $this->deletion->category($id);

        return response()->noContent();
    }

    public function addOption(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('update', Product::findOrFail($id));
        $this->actions->option($id, $r->validated());

        return $this->adminShow($id);
    }

    public function addValues(CatalogRequest $r, string $id): AdminProductResource
    {
        $option = ProductOption::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($option->product_id));
        $option = $this->actions->addValues($id, $r->validated('values'));

        return $this->adminShow($option->product_id);
    }

    public function removeOption(CatalogRequest $r, string $id): AdminProductResource
    {
        $option = ProductOption::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($option->product_id));
        $productId = $this->actions->removeOption($id, (int) $r->validated('content_version'));

        return $this->adminShow($productId);
    }

    public function removeValue(CatalogRequest $r, string $id, string $valueId): AdminProductResource
    {
        $option = ProductOption::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($option->product_id));
        $productId = $this->actions->removeValue($id, $valueId, (int) $r->validated('content_version'), (bool) $r->validated('reassign_variant_media', false));

        return $this->adminShow($productId);
    }

    /** @return array{data:array{allowed:bool,mode:string,variant_count:int,media_count:int,reason:string,variants:list<array{sku:string,status:string}>}} */
    public function valueRemovalPreview(string $id, string $valueId): array
    {
        $option = ProductOption::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($option->product_id));

        return ['data' => $this->actions->valueRemovalPreview($id, $valueId)];
    }

    public function updateValue(CatalogRequest $r, string $id, string $valueId): AdminProductResource
    {
        $option = ProductOption::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($option->product_id));
        $productId = $this->actions->updateValue($id, $valueId, $r->validated('value'), $r->validated('swatch_hex'), (int) $r->validated('content_version'));

        return $this->adminShow($productId);
    }

    public function updateSwatch(CatalogRequest $r, string $id, string $valueId): AdminProductResource
    {
        $option = ProductOption::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($option->product_id));
        $productId = $this->actions->updateSwatch($id, $valueId, $r->validated('swatch_hex'), (int) $r->validated('content_version'));

        return $this->adminShow($productId);
    }

    public function createVariant(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('update', Product::findOrFail($id));
        $this->actions->variant($id, $r->validated());

        return $this->adminShow($id);
    }

    public function updateVariant(CatalogRequest $r, string $id): AdminProductResource
    {
        $v = ProductVariant::findOrFail($id);
        Gate::authorize('update', Product::findOrFail($v->product_id));
        $this->actions->variant($v->product_id, $r->validated(), $id);

        return $this->adminShow($v->product_id);
    }
}
