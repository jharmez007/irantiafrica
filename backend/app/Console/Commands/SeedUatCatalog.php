<?php

namespace App\Console\Commands;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogTax;
use App\Catalog\LocalUatMediaImport;
use App\Inventory\InventoryService;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SeedUatCatalog extends Command
{
    protected $signature = 'iranti:seed-uat-catalog {--yes : Confirm local UAT catalogue changes without an interactive prompt} {--dry-run : Check safety, data and images without writing}';

    protected $description = 'Populate the approved local-only 30-product UAT catalogue without resetting business history';

    private const LEGACY_PRODUCT_SLUGS = [
        'phase-3n-uat-sample-2026-09-27', 'plate', 'pot', 'spoon',
    ];

    /** @var array<string,string> */
    private const LEGACY_CATEGORY_SLUGS = ['plate' => 'plate'];

    public function handle(CatalogActions $catalog, InventoryService $inventory, LocalUatMediaImport $media, CatalogTax $tax): int
    {
        try {
            $this->assertSafeEnvironment();
            $data = $this->dataset();
            $this->preflight($data, $tax);
            $actor = $this->owner();
            if ($this->option('dry-run')) {
                $this->info('DRY RUN: local iranti_local safety gate passed; 30 products, 42 SKUs and 30 images verified. No records changed.');

                return self::SUCCESS;
            }
            if (! $this->option('yes') && (! $this->input->isInteractive() || ! $this->confirm('Seed the local UAT catalogue and archive the four known development products?', false))) {
                $this->warn('No catalogue changes made. Use --yes for an explicit non-interactive run.');

                return self::FAILURE;
            }
            $this->warn('DEVELOPMENT/UAT TAX CONFIGURATION ONLY — NOT PRODUCTION TAX POLICY.');
            $categories = $this->categories($data, $catalog);
            foreach ($data['products'] as $index => $row) {
                $this->seedProduct($row, $categories[$row['category']], $actor, $catalog, $inventory, $media);
                $this->line(sprintf('%02d/30  %s — published', $index + 1, $row['name']));
            }
            $archived = $this->archiveLegacy($catalog);
            $this->verify($data);
            $this->info('UAT catalogue complete: 30 published products (21 simple, 9 variant), 42 SKUs, 30 ready images, 42 opening balances, 6 active categories.');
            $this->info('Legacy development products archived: '.($archived === [] ? 'none' : implode(', ', $archived)).'. Hard-deleted: none.');

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            $this->error('UAT catalogue stopped: '.$exception->getMessage());
            $this->warn('No destructive reset was performed. Correct the blocker, then rerun; completed items are checked before reuse.');

            return self::FAILURE;
        }
    }

    private function assertSafeEnvironment(): void
    {
        if (app()->environment() !== 'local' || config('database.default') !== 'pgsql' ||
            config('database.connections.pgsql.database') !== 'iranti_local' ||
            ! in_array(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost'], true) ||
            (int) config('database.connections.pgsql.port') !== 5432 ||
            config('catalog.disk') !== 'local') {
            throw new \RuntimeException('Refusing: only local PostgreSQL iranti_local on localhost:5432 with private local media is allowed.');
        }
        $server = DB::selectOne('select current_database() as name, inet_server_addr()::text as host, inet_server_port() as port');
        if (! $server || $server->name !== 'iranti_local' || ! in_array($server->host, ['127.0.0.1/32', '::1/128'], true) || (int) $server->port !== 5432) {
            throw new \RuntimeException('Refusing: connected PostgreSQL is not the expected local iranti_local instance.');
        }
        $this->info('Safety gate: APP_ENV=local; connected PostgreSQL iranti_local on loopback:5432.');
    }

    /** @return array<string,mixed> */
    private function dataset(): array
    {
        $path = base_path('database/uat/catalog.json');
        $raw = file_get_contents($path);
        $data = $raw === false ? null : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($data) || count($data['categories'] ?? []) !== 6 || count($data['products'] ?? []) !== 30) {
            throw new \RuntimeException('The UAT dataset must contain exactly six categories and thirty products.');
        }

        return $data;
    }

    /** @param array<string,mixed> $data */
    private function preflight(array $data, CatalogTax $tax): void
    {
        $choices = $tax->choices();
        if (! $choices['development_only'] || count($choices['data']) !== 1 || $choices['data'][0]['code'] !== 'STANDARD') {
            throw new \RuntimeException('Approved local/UAT STANDARD tax treatment is not active. Run catalog:configure-local-tax with an existing owner first.');
        }
        $manifest = json_decode((string) file_get_contents(base_path('../docs/uat/catalog-images/manifest.json')), true, 512, JSON_THROW_ON_ERROR);
        $hashes = array_column($manifest['images'] ?? [], 'sha256', 'filename');
        $skus = [];
        $slugs = [];
        $images = [];
        $variants = 0;
        foreach ($data['products'] as $row) {
            $slug = Str::slug($row['name']);
            if (isset($slugs[$slug]) || ! in_array($row['category'], array_values($data['categories']), true) ||
                trim($row['description']) === '' || trim($row['alt']) === '' ||
                ! in_array($row['kind'], ['simple', 'variant'], true) ||
                ($row['kind'] === 'variant') !== (is_string($row['option']) && $row['option'] !== '')) {
                throw new \RuntimeException('Invalid UAT product metadata: '.$row['name']);
            }
            $slugs[$slug] = true;
            $path = base_path('../docs/uat/catalog-images/'.$row['image']);
            if (isset($images[$row['image']]) || ! isset($hashes[$row['image']]) || ! is_file($path) ||
                ! hash_equals($hashes[$row['image']], (string) hash_file('sha256', $path))) {
                throw new \RuntimeException('Missing, duplicated or changed UAT image: '.$row['image']);
            }
            $images[$row['image']] = true;
            foreach ($row['variants'] as $variant) {
                if (isset($skus[$variant['sku']]) || ! preg_match('/^IRA-[A-Z0-9-]+$/D', $variant['sku']) ||
                    ! preg_match('/^[1-9][0-9]*$/D', $variant['price_minor']) ||
                    ! is_int($variant['stock']) || $variant['stock'] < 0 ||
                    ($row['kind'] === 'variant' && ! is_string($variant['value']))) {
                    throw new \RuntimeException('Invalid or duplicate UAT SKU: '.$variant['sku']);
                }
                $skus[$variant['sku']] = true;
                $variants++;
            }
        }
        if (count($images) !== 30 || $variants !== 42) {
            throw new \RuntimeException('UAT image or variant counts do not match the approved catalogue.');
        }
        $allowed = array_merge(array_keys($slugs), self::LEGACY_PRODUCT_SLUGS);
        $unknown = Product::where('status', '<>', 'archived')->whereNotIn('slug', $allowed)->pluck('slug')->all();
        if ($unknown !== []) {
            throw new \RuntimeException('Unrecognized active/draft products need manual review: '.implode(', ', $unknown));
        }
        $categoryAllowed = array_merge(array_values($data['categories']), array_keys(self::LEGACY_CATEGORY_SLUGS));
        $unknownCategories = Category::where('status', '<>', 'archived')->whereNotIn('slug', $categoryAllowed)->pluck('slug')->all();
        if ($unknownCategories !== []) {
            throw new \RuntimeException('Unrecognized active/draft categories need manual review: '.implode(', ', $unknownCategories));
        }
    }

    private function owner(): User
    {
        $owners = User::where('status', 'active')->whereHas('roles', fn ($query) => $query->where('code', 'owner'))->limit(2)->get();
        $owner = $owners->first();
        if ($owners->count() !== 1 || $owner === null || ! $owner->hasPermission('inventory.adjust') ||
            ! $owner->hasPermission('catalog.create_update') || ! $owner->hasPermission('catalog.publish_archive')) {
            throw new \RuntimeException('Exactly one active Business Owner with catalog and inventory grants is required.');
        }

        return $owner;
    }

    /** @param array<string,mixed> $data
     * @return array<string,Category>
     */
    private function categories(array $data, CatalogActions $catalog): array
    {
        $result = [];
        foreach ($data['categories'] as $name => $slug) {
            $existing = Category::where('slug', $slug)->first();
            if ($existing && $existing->name !== $name) {
                throw new \RuntimeException('Existing UAT category name conflicts: '.$slug);
            }
            $result[$slug] = $existing
                ? ($existing->status === 'active' ? $existing : $catalog->category(['name' => $name, 'status' => 'active'], $existing->id))
                : $catalog->category(['name' => $name, 'slug' => $slug, 'status' => 'active']);
        }

        return $result;
    }

    /** @param array<string,mixed> $row */
    private function seedProduct(array $row, Category $category, User $actor, CatalogActions $catalog, InventoryService $inventory, LocalUatMediaImport $media): void
    {
        $slug = Str::slug($row['name']);
        $product = Product::where('slug', $slug)->first();
        if (! $product) {
            $product = $catalog->product([
                'name' => $row['name'], 'slug' => $slug, 'description' => $row['description'],
                'kind' => $row['kind'], 'tax_category_code' => 'STANDARD', 'category_ids' => [$category->id],
            ]);
        } elseif ($product->name !== $row['name'] || $product->description !== $row['description'] ||
            $product->kind !== $row['kind'] || $product->tax_category_code !== 'STANDARD' ||
            $product->categories()->pluck('categories.id')->all() !== [$category->id] || $product->status === 'archived') {
            throw new \RuntimeException('Existing UAT product conflicts with approved data: '.$row['name']);
        }
        $values = [];
        if ($row['kind'] === 'variant') {
            $options = $product->options()->with('values')->get();
            $existingOption = $options->first();
            if ($existingOption === null) {
                $option = $catalog->option($product->id, ['name' => $row['option'], 'values' => array_column($row['variants'], 'value')]);
            } elseif ($options->count() === 1 && $existingOption->name === $row['option'] &&
                $existingOption->values->pluck('value')->all() === array_column($row['variants'], 'value')) {
                $option = $existingOption;
            } else {
                throw new \RuntimeException('Existing UAT option configuration conflicts: '.$row['name']);
            }
            $values = $option->values->pluck('id', 'value')->all();
        } elseif ($product->options()->exists()) {
            throw new \RuntimeException('Simple UAT product unexpectedly has options: '.$row['name']);
        }
        foreach ($row['variants'] as $item) {
            $variant = $product->variants()->where('sku', $item['sku'])->first();
            if (! $variant) {
                $variant = $catalog->variant($product->id, [
                    'sku' => $item['sku'], 'unit_price_minor' => $item['price_minor'],
                    'option_value_ids' => $row['kind'] === 'variant' ? [$values[$item['value']]] : [],
                ]);
            } elseif ($variant->unit_price_minor !== $item['price_minor'] || $variant->status !== 'active' ||
                $variant->selections()->pluck('option_value_id')->all() !== ($row['kind'] === 'variant' ? [$values[$item['value']]] : [])) {
                throw new \RuntimeException('Existing UAT variant conflicts: '.$item['sku']);
            }
            $balance = $variant->inventory()->first();
            if (! $balance) {
                if ($item['stock'] === 0) {
                    // The approved ledger requires a nonzero OPENING movement. Keep
                    // both service operations atomic so a zero-stock fixture can
                    // never be left with a stray one-unit balance on failure.
                    DB::transaction(function () use ($inventory, $variant, $actor): void {
                        $inventory->initializeStock($variant->id, 1, 'UAT zero-stock fixture opening step', (string) Str::uuid(), $actor);
                        $opened = $variant->inventory()->firstOrFail();
                        $inventory->adjustStock($variant->id, -1, 'UAT zero-stock fixture final balance', (string) Str::uuid(), $actor, $opened->version);
                    });
                } else {
                    $inventory->initializeStock($variant->id, $item['stock'], 'Opening local UAT catalogue stock', (string) Str::uuid(), $actor);
                }
            } elseif ($balance->on_hand !== $item['stock'] || $balance->reserved !== 0) {
                $this->warn('Existing UAT stock changed; preserving ledger and balance for '.$item['sku'].'.');
            }
            // This is alert configuration only; the service leaves on-hand and
            // reservations untouched and audits each actual threshold change.
            $inventory->setLowStockThreshold($variant->id, (int) config('inventory.low_stock_threshold'), $actor);
        }
        if ($product->variants()->count() !== count($row['variants'])) {
            throw new \RuntimeException('Unexpected extra UAT variants: '.$row['name']);
        }
        $media->import($product, base_path('../docs/uat/catalog-images/'.$row['image']), $row['alt']);
        if ($product->media()->whereNotIn('status', ['retired', 'rejected'])->count() !== 1) {
            throw new \RuntimeException('Unexpected extra UAT media: '.$row['name']);
        }
        $product->refresh();
        if ($product->status === 'draft') {
            $catalog->transition($product->id, $product->content_version, false);
        }
        $catalog->publishable($product);
    }

    /** @return list<string> */
    private function archiveLegacy(CatalogActions $catalog): array
    {
        $archived = [];
        foreach (self::LEGACY_PRODUCT_SLUGS as $slug) {
            $product = Product::where('slug', $slug)->first();
            if ($product && $product->status !== 'archived') {
                $catalog->transition($product->id, $product->content_version, true);
                $archived[] = $slug;
            }
        }
        foreach (self::LEGACY_CATEGORY_SLUGS as $slug) {
            $category = Category::where('slug', $slug)->first();
            if ($category && $category->status !== 'archived') {
                $catalog->category(['name' => $category->name, 'status' => 'archived'], $category->id);
            }
        }

        return $archived;
    }

    /** @param array<string,mixed> $data */
    private function verify(array $data): void
    {
        $slugs = array_map(fn (array $row): string => Str::slug($row['name']), $data['products']);
        $products = Product::whereIn('slug', $slugs)->get();
        if ($products->count() !== 30 || $products->where('status', 'published')->count() !== 30 ||
            ProductVariant::whereIn('product_id', $products->pluck('id'))->count() !== 42 ||
            DB::table('product_media')->whereIn('product_id', $products->pluck('id'))->where('status', 'ready')->count() !== 30 ||
            DB::table('inventory')->whereIn('variant_id', ProductVariant::whereIn('product_id', $products->pluck('id'))->pluck('id'))->count() !== 42 ||
            Category::where('status', 'active')->count() !== 6) {
            throw new \RuntimeException('Final UAT catalogue verification failed; inspect the partially completed run.');
        }
    }
}
