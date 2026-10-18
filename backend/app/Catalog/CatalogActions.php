<?php

namespace App\Catalog;

use App\Checkout\CheckoutConfiguration;
use App\Models\Category;
use App\Models\OptionValue;
use App\Models\Product;
use App\Models\ProductOption;
use App\Models\ProductVariant;
use App\Models\VariantOptionValue;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class CatalogActions
{
    /** Serialize catalog writes at this launch scale; never take this lock in inventory workflows. */
    public function lock(): void
    {
        // Configuration precedes catalog/product locks, matching checkout lock order.
        CheckoutConfiguration::lock();
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
            $taxChoices = app(CatalogTax::class)->choices();
            $choices = $taxChoices['data'];
            if (isset($data['tax_category_code']) && ! in_array($data['tax_category_code'], array_column($choices, 'code'), true)) {
                $this->invalid('tax_category_code', 'Choose an available tax treatment or leave it unresolved for this draft.');
            }
            if (! $id) {
                $data['kind'] ??= 'simple';
            }

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
            foreach ($data['values'] as $position => $input) {
                [$value, $swatch] = $this->valueInput($input, $option->name);
                if ($this->optionValueExists($option, $value)) {
                    $this->invalid('values', $value.' has already been added.');
                }
                $option->values()->create(['product_id' => $id, 'value' => $value, 'swatch_hex' => $swatch, 'position' => $position]);
            }
            $product->increment('content_version');
            CatalogAudit::record('option_created', 'product', $id, ['option_id' => $option->id]);

            return $option->load('values');
        });
    }

    /** @param list<string|array{value:string,swatch_hex?:string|null}> $values */
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
            foreach ($values as $input) {
                [$value, $swatch] = $this->valueInput($input, $option->name);
                if ($this->optionValueExists($option, $value)) {
                    $this->invalid('values', $value.' has already been added.');
                }
                $option->values()->create(['product_id' => $product->id, 'value' => $value, 'swatch_hex' => $swatch, 'position' => $option->values()->count()]);
            }
            $product->increment('content_version');
            CatalogAudit::record('option_values_added', 'product', $product->id, ['option_id' => $id, 'count' => count($values)]);

            return $option;
        });
    }

    public function removeOption(string $id, int $version): string
    {
        return DB::transaction(function () use ($id, $version): string {
            $this->lock();
            $option = ProductOption::findOrFail($id);
            $product = Product::lockForUpdate()->findOrFail($option->product_id);
            abort_if($product->content_version !== $version, 409);
            abort_if($product->status !== 'draft' || $product->variants()->exists(), 409);
            $option->values()->delete();
            $option->delete();
            $product->increment('content_version');
            CatalogAudit::record('option_removed', 'product', $product->id, ['option_id' => $id]);

            return $product->id;
        });
    }

    /** @return array{allowed:bool,mode:string,variant_count:int,media_count:int,reason:string,variants:list<array{sku:string,status:string}>} */
    public function valueRemovalPreview(string $optionId, string $valueId): array
    {
        $option = ProductOption::findOrFail($optionId);
        $value = $option->values()->whereKey($valueId)->firstOrFail();

        return $this->valueRemovalPlan(Product::findOrFail($option->product_id), $value);
    }

    /** @return array{allowed:bool,mode:string,variant_count:int,media_count:int,reason:string,variants:list<array{sku:string,status:string}>} */
    private function valueRemovalPlan(Product $product, OptionValue $value): array
    {
        if ($product->status === 'archived' || $value->archived_at !== null) {
            return ['allowed' => false, 'mode' => 'blocked', 'variant_count' => 0, 'media_count' => 0, 'reason' => 'This colour is already removed or the product is archived.', 'variants' => []];
        }
        $ids = DB::table('variant_option_values')->where('option_value_id', $value->id)->pluck('variant_id')->all();
        $linked = ProductVariant::whereIn('id', $ids)->orderBy('sku')->get(['sku', 'status']);
        $variants = array_values($linked->map(fn (ProductVariant $variant): array => ['sku' => $variant->sku, 'status' => $variant->status])->all());
        $media = $ids === [] ? 0 : DB::table('product_media')->whereIn('variant_id', $ids)->count();
        $history = false;
        foreach (['inventory', 'inventory_movements', 'reservation_items', 'cart_items', 'checkout_lines', 'order_items'] as $table) {
            if ($ids !== [] && DB::table($table)->whereIn('variant_id', $ids)->exists()) {
                $history = true;
                break;
            }
        }
        if ($ids === [] || ($product->status === 'draft' && ! $history)) {
            return ['allowed' => true, 'mode' => 'delete', 'variant_count' => count($ids), 'media_count' => $media, 'reason' => $media > 0 ? 'Unused draft variants will be deleted and their images reassigned to All variants. No image files will be deleted.' : 'This unused colour and its unused draft variants can be permanently removed.', 'variants' => $variants];
        }
        $activeTotal = ProductVariant::where('product_id', $product->id)->where('status', 'active')->count();
        $activeLinked = $linked->where('status', 'active')->count();
        if ($product->status === 'published' && $activeTotal <= $activeLinked) {
            return ['allowed' => false, 'mode' => 'blocked', 'variant_count' => count($ids), 'media_count' => $media, 'reason' => 'This is the last active colour. Keep at least one active variant before removing it from sale.', 'variants' => $variants];
        }

        return ['allowed' => true, 'mode' => 'archive', 'variant_count' => count($ids), 'media_count' => $media, 'reason' => $history ? 'This colour has historical activity. Its variants will be removed from sale rather than permanently deleted. SKU, stock, images and history will be retained.' : 'This published colour will be removed from sale. Its variants, SKU and images will be retained.', 'variants' => $variants];
    }

    public function removeValue(string $optionId, string $valueId, int $version, bool $reassignMedia = false): string
    {
        try {
            return DB::transaction(function () use ($optionId, $valueId, $version, $reassignMedia): string {
                $this->lock();
                $option = ProductOption::findOrFail($optionId);
                $product = Product::lockForUpdate()->findOrFail($option->product_id);
                abort_if($product->content_version !== $version, 409);
                $value = $option->values()->whereKey($valueId)->firstOrFail();
                $plan = $this->valueRemovalPlan($product, $value);
                if (! $plan['allowed']) {
                    $this->invalid('value', $plan['reason']);
                }
                $ids = DB::table('variant_option_values')->where('option_value_id', $valueId)->pluck('variant_id')->all();
                ProductVariant::whereIn('id', $ids)->lockForUpdate()->get();
                if ($plan['mode'] === 'delete') {
                    if ($plan['media_count'] > 0 && ! $reassignMedia) {
                        $this->invalid('reassign_variant_media', 'Confirm that variant images should become All variants before removing this colour.');
                    }
                    if ($ids !== []) {
                        DB::table('product_media')->whereIn('variant_id', $ids)->update(['variant_id' => null, 'updated_at' => now()]);
                        DB::table('variant_option_values')->whereIn('variant_id', $ids)->delete();
                        DB::table('product_variants')->whereIn('id', $ids)->delete();
                    }
                    $value->delete();
                } else {
                    ProductVariant::whereIn('id', $ids)->where('status', 'active')->update(['status' => 'archived', 'archived_at' => now(), 'updated_at' => now(), 'price_version' => DB::raw('price_version + 1')]);
                    $value->update(['archived_at' => now()]);
                }
                $product->increment('content_version');
                CatalogAudit::record('option_value_removed', 'product', $product->id, ['option_id' => $optionId, 'value_id' => $valueId, 'mode' => $plan['mode'], 'variant_count' => count($ids), 'media_reassigned' => $plan['mode'] === 'delete' ? $plan['media_count'] : 0]);

                return $product->id;
            });
        } catch (QueryException $e) {
            if ($e->getCode() !== '23503') {
                throw $e;
            }
            $this->invalid('value', 'This colour gained a reference. Reload and review it before removing.');
        }
    }

    public function updateValue(string $optionId, string $valueId, string $name, ?string $hex, int $version): string
    {
        return DB::transaction(function () use ($optionId, $valueId, $name, $hex, $version): string {
            $this->lock();
            $option = ProductOption::findOrFail($optionId);
            $product = Product::lockForUpdate()->findOrFail($option->product_id);
            abort_if($product->status === 'archived' || $product->content_version !== $version, 409);
            if (! ColourSwatches::isColourOption($option->name)) {
                $this->invalid('value', 'Edit colour is available only for Colour options.');
            }
            $value = $option->values()->whereKey($valueId)->firstOrFail();
            abort_if($value->archived_at !== null, 409);
            $name = $this->normaliseOptionValue($name);
            if ($name === '') {
                $this->invalid('value', 'Enter a colour name.');
            }
            if ($this->optionValueExists($option, $name, $valueId)) {
                $this->invalid('value', $name.' has already been added.');
            }
            $swatch = ColourSwatches::normalize($hex);
            if ($hex !== null && $swatch === null) {
                $this->invalid('swatch_hex', 'Enter a six-digit hex colour such as #335438.');
            }
            if ($value->value === $name && $value->swatch_hex === $swatch) {
                return $product->id;
            }
            $before = ['value' => $value->value, 'swatch_hex' => $value->swatch_hex];
            $value->update(['value' => $name, 'swatch_hex' => $swatch]);
            $product->increment('content_version');
            CatalogAudit::record('option_value_updated', 'product', $product->id, ['option_id' => $optionId, 'value_id' => $valueId, 'before' => $before, 'after' => ['value' => $name, 'swatch_hex' => $swatch]]);

            return $product->id;
        });
    }

    public function updateSwatch(string $optionId, string $valueId, ?string $hex, int $version): string
    {
        return DB::transaction(function () use ($optionId, $valueId, $hex, $version): string {
            $this->lock();
            $option = ProductOption::findOrFail($optionId);
            $product = Product::lockForUpdate()->findOrFail($option->product_id);
            abort_if($product->status === 'archived' || $product->content_version !== $version, 409);
            if (! ColourSwatches::isColourOption($option->name)) {
                $this->invalid('swatch_hex', 'Swatches are available only for Colour options.');
            }
            $swatch = ColourSwatches::normalize($hex);
            if ($hex !== null && $swatch === null) {
                $this->invalid('swatch_hex', 'Enter a six-digit hex colour such as #335438.');
            }
            $value = $option->values()->whereKey($valueId)->firstOrFail();
            abort_if($value->archived_at !== null, 409);
            if ($value->swatch_hex === $swatch) {
                return $product->id;
            }
            $before = $value->swatch_hex;
            $value->update(['swatch_hex' => $swatch]);
            $product->increment('content_version');
            CatalogAudit::record('option_value_swatch_updated', 'product', $product->id, ['option_id' => $optionId, 'value_id' => $valueId, 'before' => $before, 'after' => $swatch]);

            return $product->id;
        });
    }

    /** @return array{string, string|null} */
    private function valueInput(mixed $input, string $optionName): array
    {
        $value = is_array($input) ? ($input['value'] ?? null) : $input;
        $hex = is_array($input) ? ($input['swatch_hex'] ?? null) : null;
        if (! is_string($value) || trim($value) === '') {
            $this->invalid('values', 'Enter a choice name.');
        }
        $swatch = ColourSwatches::normalize($hex);
        if ($hex !== null && $swatch === null) {
            $this->invalid('values', 'Swatches must be six-digit hex colours.');
        }
        if ($swatch !== null && ! ColourSwatches::isColourOption($optionName)) {
            $this->invalid('values', 'Swatches are available only for Colour options.');
        }

        return [$this->normaliseOptionValue($value), $swatch];
    }

    private function normaliseOptionValue(string $value): string
    {
        return preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    }

    private function optionValueExists(ProductOption $option, string $name, ?string $exceptId = null): bool
    {
        $normalised = mb_strtolower($this->normaliseOptionValue($name));

        return $option->values()->get(['id', 'value'])->contains(
            fn (OptionValue $value): bool => $value->id !== $exceptId && mb_strtolower($this->normaliseOptionValue($value->value)) === $normalised
        );
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
                if (($data['status'] ?? null) === 'active' && $variant->status === 'archived' && DB::table('variant_option_values')->join('option_values', 'variant_option_values.option_value_id', '=', 'option_values.id')->where('variant_option_values.variant_id', $variant->id)->whereNotNull('option_values.archived_at')->exists()) {
                    $this->invalid('status', 'This colour was removed; its historical variant cannot be restored to sale.');
                }
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
                if ($values->count() !== count($data['option_value_ids']) || $values->contains(fn (OptionValue $value): bool => $value->archived_at !== null) || $values->pluck('option_id')->unique()->count() !== $values->count() || ($product->kind === 'simple' && $values->isNotEmpty()) || ($product->kind === 'variant' && ($options === 0 || $values->count() !== $options))) {
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

    /** @return list<string> */
    public function publicationIssues(Product $product): array
    {
        $issues = [];
        if (trim($product->description) === '') {
            $issues[] = 'Add a description.';
        }
        if (! $product->categories->contains('status', 'active')) {
            $issues[] = 'Select at least one active category.';
        }
        if (! $product->media->contains('status', 'ready')) {
            $issues[] = 'Add an image and wait for it to finish processing.';
        }
        $variants = $product->variants->where('status', 'active');
        if ($variants->isEmpty() || ($product->kind === 'simple' && ($variants->count() !== 1 || $variants->first()->option_signature !== ''))) {
            $issues[] = 'Add a complete active variant with a SKU and price.';
        }
        $optionCount = $product->options->count();
        foreach ($variants as $variant) {
            if ($product->kind === 'variant' && ($optionCount === 0 || $variant->selections->count() !== $optionCount)) {
                $issues[] = 'Choose a value for every variant option.';
                break;
            }
        }

        return $issues;
    }

    public function publishable(Product $product): void
    {
        // Reload within the write transaction; never authorize from a cached projection.
        $product->load(['categories', 'media', 'variants.selections', 'options']);
        $issues = $this->publicationIssues($product);
        if ($issues !== []) {
            throw ValidationException::withMessages(['publication' => $issues]);
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

    public function restore(string $id, int $version): Product
    {
        return DB::transaction(function () use ($id, $version): Product {
            $this->lock();
            $product = Product::lockForUpdate()->findOrFail($id);
            $this->version($product, ['content_version' => $version]);
            abort_unless($product->status === 'archived', 409);
            $before = $product->only(['status', 'content_version']);
            $product->status = 'draft';
            $product->archived_at = null;
            $product->content_version++;
            $product->save();
            CatalogAudit::record('product_restored', 'product', $id, ['before' => $before, 'after' => $product->only(['status', 'content_version'])]);

            return $product;
        });
    }
}
