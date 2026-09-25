<?php

namespace App\Catalog;

use App\Models\Category;
use App\Models\OptionValue;
use App\Models\Product;
use App\Models\ProductOption;
use App\Models\ProductVariant;
use App\Models\VariantOptionValue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class CatalogActions
{
    /** Serialize catalog writes at this launch scale; never take this lock in inventory workflows. */
    public function lock(): void
    {
        DB::select('SELECT pg_advisory_xact_lock(310031)');
    }

    public function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }

    public function slug(string $table, string $name, int $max): string
    {
        $base = substr(Str::slug($name), 0, $max - 12) ?: 'product';
        $slug = $base;
        $i = 2;
        while (DB::table($table)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    /** @param array<string, mixed> $data */
    public function product(array $data, ?string $id = null): Product
    {
        return DB::transaction(function () use ($data, $id): Product {
            $this->lock();
            $product = $id ? Product::lockForUpdate()->findOrFail($id) : new Product;
            if ($id) {
                abort_if($product->status === 'archived', 409);
                $this->version($product, $data);
            } else {
                $data['slug'] ??= $this->slug('products', $data['name'], 220);
                if (Product::where('slug', $data['slug'])->exists()) {
                    $this->invalid('slug', 'This slug is already reserved.');
                }
            }
            $before = $id ? $this->productSnapshot($product) : [];
            if (array_key_exists('description', $data) && $data['description'] === null) {
                $data['description'] = '';
            }
            $product->fill(array_intersect_key($data, array_flip(['name', 'slug', 'description', 'kind', 'tax_category_code'])));
            if ($id) {
                $product->content_version++;
            }
            $product->save();
            if (isset($data['category_ids'])) {
                $sync = [];
                foreach ($data['category_ids'] as $category) {
                    $sync[$category] = ['id' => (string) Str::uuid()];
                }
                // Preserve existing association IDs when membership is unchanged.
                foreach (DB::table('product_categories')->where('product_id', $product->id)->get() as $pivot) {
                    if (isset($sync[$pivot->category_id])) {
                        $sync[$pivot->category_id]['id'] = $pivot->id;
                    }
                }
                $product->categories()->sync($sync);
            }
            if ($product->status === 'published') {
                $this->publishable($product);
            }
            $product->refresh();
            CatalogAudit::record($id ? 'product_updated' : 'product_created', 'product', $product->id, ['before' => $before, 'after' => $this->productSnapshot($product)]);

            return $product;
        });
    }

    /** @param array<string, mixed> $data */
    public function category(array $data, ?string $id = null): Category
    {
        return DB::transaction(function () use ($data, $id): Category {
            $this->lock();
            $category = $id ? Category::lockForUpdate()->findOrFail($id) : new Category;
            $before = $id ? $category->only(['name', 'slug', 'status', 'parent_id']) : [];
            if (! $id) {
                $data['slug'] ??= $this->slug('categories', $data['name'], 180);
                if (Category::where('slug', $data['slug'])->exists()) {
                    $this->invalid('slug', 'This slug is already reserved.');
                }
            }
            $cursor = $data['parent_id'] ?? null;
            $seen = [];
            while ($cursor) {
                if ($cursor === $id || isset($seen[$cursor])) {
                    $this->invalid('parent_id', 'Category hierarchy must be acyclic.');
                } $seen[$cursor] = true;
                $cursor = Category::where('id', $cursor)->firstOrFail()->parent_id;
            }
            $category->fill($data)->save();
            $category->refresh();
            CatalogAudit::record('category_changed', 'category', $category->id, ['before' => $before, 'after' => $category->only(['name', 'slug', 'status', 'parent_id'])]);

            return $category;
        });
    }

    /**
     * Audit only catalog fields. Bound long copy while preserving evidence of its exact value.
     *
     * @return array<string, mixed>
     */
    private function productSnapshot(Product $product): array
    {
        return array_merge($product->only(['name', 'slug', 'kind', 'status', 'tax_category_code', 'content_version']), [
            'description' => [
                'preview' => mb_substr($product->description, 0, 500),
                'length' => mb_strlen($product->description),
                'sha256' => hash('sha256', $product->description),
            ],
            'category_ids' => $product->categories()->pluck('categories.id')->sort()->values()->all(),
        ]);
    }

    /** @param array<string, mixed> $data */
    public function option(string $id, array $data): ProductOption
    {
        return DB::transaction(function () use ($id, $data): ProductOption {
            $this->lock();
            $product = Product::lockForUpdate()->findOrFail($id);
            abort_if($product->status !== 'draft' || $product->kind !== 'variant' || $product->variants()->exists(), 409);
            if ($product->options()->count() >= 10) {
                $this->invalid('name', 'At most ten options are supported.');
            }
            if ($product->options()->whereRaw('lower(name) = ?', [mb_strtolower($data['name'])])->exists()) {
                $this->invalid('name', 'Option already exists.');
            }
            $option = $product->options()->create(['name' => $data['name'], 'position' => $data['position'] ?? 0]);
            foreach ($data['values'] as $position => $value) {
                $option->values()->create(['product_id' => $id, 'value' => $value, 'position' => $position]);
            }
            $product->increment('content_version');
            CatalogAudit::record('option_created', 'product', $id, ['option_id' => $option->id]);

            return $option->load('values');
        });
    }

    /** @param list<string> $values */
    public function addValues(string $id, array $values): ProductOption
    {
        return DB::transaction(function () use ($id, $values): ProductOption {
            $this->lock();
            $option = ProductOption::findOrFail($id);
            $product = Product::lockForUpdate()->findOrFail($option->product_id);
            abort_if($product->status === 'archived', 409);
            if ($option->values()->count() + count($values) > 50) {
                $this->invalid('values', 'At most fifty values per option.');
            }
            foreach ($values as $value) {
                if ($option->values()->whereRaw('lower(value) = ?', [mb_strtolower($value)])->exists()) {
                    $this->invalid('values', 'This value already exists.');
                }
                $option->values()->create(['product_id' => $product->id, 'value' => $value, 'position' => $option->values()->count()]);
            }
            $product->increment('content_version');
            CatalogAudit::record('option_values_added', 'product', $product->id, ['option_id' => $id, 'count' => count($values)]);

            return $option;
        });
    }

    /** @param array<string, mixed> $data */
    public function variant(string $productId, array $data, ?string $id = null): ProductVariant
    {
        return DB::transaction(function () use ($productId, $data, $id): ProductVariant {
            $this->lock();
            $product = Product::lockForUpdate()->findOrFail($productId);
            abort_if($product->status === 'archived', 409);
            if ($id) {
                $variant = ProductVariant::where('product_id', $productId)->lockForUpdate()->findOrFail($id);
                abort_if($variant->price_version !== (int) $data['price_version'], 409);
                $before = ['unit_price_minor' => $variant->unit_price_minor, 'status' => $variant->status];
                if (isset($data['unit_price_minor'])) {
                    $variant->unit_price_minor = $data['unit_price_minor'];
                }
                if (isset($data['status'])) {
                    $variant->status = $data['status'];
                    $variant->archived_at = $data['status'] === 'archived' ? now()->toImmutable() : null;
                }
                $variant->price_version++;
                $variant->save();
            } else {
                $values = OptionValue::where('product_id', $productId)->whereIn('id', $data['option_value_ids'])->orderBy('option_id')->get();
                $options = $product->options()->count();
                if ($values->count() !== count($data['option_value_ids']) || $values->pluck('option_id')->unique()->count() !== $values->count() || ($product->kind === 'simple' && $values->isNotEmpty()) || ($product->kind === 'variant' && ($options === 0 || $values->count() !== $options))) {
                    $this->invalid('option_value_ids', 'Choose exactly one value for every option of this product.');
                }
                $signature = $values->map(fn (OptionValue $v): string => $v->option_id.':'.$v->id)->implode('|');
                if ($product->variants()->where('option_signature', $signature)->exists()) {
                    $this->invalid('option_value_ids', 'This combination already exists, including archived variants.');
                }
                $data['sku'] = mb_strtoupper(trim($data['sku']));
                if (ProductVariant::where('sku', $data['sku'])->exists()) {
                    $this->invalid('sku', 'This SKU is already reserved.');
                }
                $variant = $product->variants()->create(['sku' => $data['sku'], 'unit_price_minor' => $data['unit_price_minor'], 'currency' => 'NGN', 'option_signature' => $signature]);
                foreach ($values as $value) {
                    VariantOptionValue::create(['product_id' => $productId, 'variant_id' => $variant->id, 'option_id' => $value->option_id, 'option_value_id' => $value->id]);
                }
                $before = [];
            }
            if ($product->status === 'published') {
                $this->publishable($product);
            }
            $product->increment('content_version');
            CatalogAudit::record($id ? 'variant_updated' : 'variant_created', 'variant', $variant->id, ['before' => $before, 'after' => ['unit_price_minor' => $variant->unit_price_minor, 'status' => $variant->status ?? 'active']]);

            return $variant->refresh()->load('selections');
        });
    }

    /** @param array<string, mixed> $data */
    public function version(Product $product, array $data): void
    {
        abort_if($product->content_version !== (int) $data['content_version'], 409);
    }

    public function publishable(Product $product): void
    {
        if (trim($product->description) === '' || ! $product->categories()->where('status', 'active')->exists() || ! $product->media()->where('status', 'ready')->exists()) {
            $this->invalid('publication', 'A description, active category and ready image are required.');
        }
        $variants = $product->variants()->where('status', 'active')->with('selections')->get();
        if ($variants->isEmpty() || ($product->kind === 'simple' && ($variants->count() !== 1 || $variants->first()->option_signature !== ''))) {
            $this->invalid('publication', 'At least one complete active SKU is required.');
        }
        $optionCount = $product->options()->count();
        foreach ($variants as $variant) {
            if ($product->kind === 'variant' && ($optionCount === 0 || $variant->selections->count() !== $optionCount)) {
                $this->invalid('publication', 'Variant options are incomplete.');
            }
        }
    }

    public function transition(string $id, int $version, bool $archive): Product
    {
        return DB::transaction(function () use ($id, $version, $archive): Product {
            $this->lock();
            $product = Product::lockForUpdate()->findOrFail($id);
            $this->version($product, ['content_version' => $version]);
            $before = $product->only(['status', 'content_version']);
            if (! $archive) {
                abort_if($product->status === 'archived', 409);
                $this->publishable($product);
            }
            $product->status = $archive ? 'archived' : 'published';
            $product->archived_at = $archive ? now()->toImmutable() : null;
            if (! $archive) {
                $product->published_at ??= now()->toImmutable();
            }
            $product->content_version++;
            $product->save();
            CatalogAudit::record($archive ? 'product_archived' : 'product_published', 'product', $id, ['before' => $before, 'after' => $product->only(['status', 'content_version'])]);

            return $product;
        });
    }
}
