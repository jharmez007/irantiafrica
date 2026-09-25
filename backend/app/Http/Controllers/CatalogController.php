<?php

namespace App\Http\Controllers;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogRead;
use App\Http\Requests\Catalog\CatalogQuery;
use App\Http\Requests\Catalog\CatalogRequest;
use App\Http\Resources\Catalog\AdminProductResource;
use App\Http\Resources\Catalog\PublicProductResource;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class CatalogController
{
    public function __construct(private CatalogActions $actions) {}

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
        $p = CatalogRead::query(true)->findOrFail($id);
        Gate::authorize('view', $p);

        return new AdminProductResource($p);
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

        return response()->json(['data' => $p->getCollection()->map(fn (Category $c): array => $admin ? $c->only(['id', 'name', 'slug', 'parent_id', 'status']) : $c->only(['name', 'slug'])), 'meta' => ['page' => $p->currentPage(), 'last_page' => $p->lastPage(), 'total' => $p->total()]]);
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

    public function addOption(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('update', Product::findOrFail($id));
        $this->actions->option($id, $r->validated());

        return $this->adminShow($id);
    }

    public function addValues(CatalogRequest $r, string $id): AdminProductResource
    {
        Gate::authorize('catalog.create_update');
        $option = $this->actions->addValues($id, $r->validated('values'));

        return $this->adminShow($option->product_id);
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
