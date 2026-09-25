<?php

namespace Tests\Infrastructure;

use App\Catalog\CatalogActions;
use App\Catalog\CatalogRead;
use App\Http\Resources\Catalog\AdminProductResource;
use App\Inventory\InventoryService;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CatalogAvailabilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        config(['catalog.disk' => 'local', 'cache.limiter' => 'array']);
        Storage::fake('local');
    }

    /**
     * Projection fixtures cover reserved and missing pools without implementing reservation commands.
     * Production inventory writes must use the inventory command service and its ledger.
     *
     * @param  list<array{stock?: array{int, int}, price?: string, archived?: bool}>  $specifications
     */
    private function product(string $name, array $specifications): Product
    {
        $actions = app(CatalogActions::class);
        $category = $actions->category(['name' => 'Home', 'status' => 'active']);
        $product = $actions->product(['name' => $name, 'kind' => count($specifications) === 1 ? 'simple' : 'variant', 'description' => 'Informational catalog fixture.', 'tax_category_code' => 'test', 'category_ids' => [$category->id]]);
        $option = count($specifications) > 1 ? $actions->option($product->id, ['name' => 'Finish', 'values' => array_map(fn (int $i): string => 'Finish '.$i, array_keys($specifications))]) : null;
        foreach ($specifications as $index => $specification) {
            $variant = $actions->variant($product->id, ['sku' => strtoupper((string) Str::uuid()), 'unit_price_minor' => $specification['price'] ?? '1000', 'option_value_ids' => $option === null ? [] : [$option->values[$index]->id]]);
            if (isset($specification['stock'])) {
                DB::table('inventory')->insert(['id' => (string) Str::uuid(), 'variant_id' => $variant->id, 'on_hand' => $specification['stock'][0], 'reserved' => $specification['stock'][1], 'low_stock_threshold' => 0, 'version' => 1]);
            }
            if ($specification['archived'] ?? false) {
                $variant->update(['status' => 'archived', 'archived_at' => now()]);
            }
        }
        $media = ProductMedia::create(['product_id' => $product->id, 'object_key' => 'quarantine/'.Str::uuid(), 'status' => 'ready', 'alt_text' => $name, 'width' => 2, 'height' => 2]);
        $key = 'derivatives/'.$media->id.'/320.webp';
        $image = imagecreatetruecolor(2, 2);
        ob_start();
        imagewebp($image);
        $bytes = ob_get_clean();
        imagedestroy($image);
        Storage::disk('local')->put($key, $bytes);
        $media->update(['derivatives' => ['320' => ['key' => $key, 'width' => 2, 'height' => 2]]]);

        return $actions->transition($product->id, $product->fresh()->content_version, false);
    }

    public function test_browse_search_and_category_lists_require_positive_unreserved_stock(): void
    {
        $this->product('Woven missing', [[]]);
        $this->product('Woven zero', [['stock' => [0, 0]]]);
        $this->product('Woven reserved', [['stock' => [7, 7]]]);
        $available = $this->product('Woven available', [['stock' => [8, 7]]]);

        foreach (['/api/v1/products', '/api/v1/search?q=woven', '/api/v1/products?category='.$available->categories->first()->slug] as $url) {
            $this->getJson($url)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.slug', $available->slug)->assertJsonPath('data.0.available', true);
        }
        $this->assertSame([$available->id], CatalogRead::query()->pluck('id')->all());
    }

    public function test_sold_out_detail_and_media_remain_public_without_quantity_disclosure(): void
    {
        $product = $this->product('Informational basket', [['stock' => [12, 12]]]);
        $data = $this->getJson('/api/v1/products/'.$product->slug)->assertOk()->assertJsonPath('data.available', false)->assertJsonPath('data.variants.0.available', false)->assertJsonPath('data.price_min_minor', '1000')->json('data');
        $this->getJson('/api/v1/products')->assertOk()->assertJsonCount(0, 'data');
        $this->get($data['media'][0]['sources'][0]['url'])->assertOk()->assertHeader('Content-Type', 'image/webp');
        $json = json_encode($data, JSON_THROW_ON_ERROR);
        foreach (['on_hand', 'reserved', 'low_stock_threshold', 'inventory', 'available_quantity'] as $field) {
            $this->assertStringNotContainsString('"'.$field.'"', $json);
        }

        $admin = (new AdminProductResource(CatalogRead::query(true)->findOrFail($product->id)))->resolve();
        $this->assertArrayNotHasKey('available', $admin);
        $this->assertArrayNotHasKey('available', $admin['variants'][0]);
        $this->assertSame('published', $admin['status']);
    }

    public function test_mixed_variants_and_browse_prices_use_only_available_active_skus(): void
    {
        $mixed = $this->product('Mixed basket', [
            ['stock' => [0, 0], 'price' => '100'],
            ['stock' => [5, 4], 'price' => '5000'],
            ['stock' => [20, 0], 'price' => '50', 'archived' => true],
            ['price' => '200'],
        ]);
        $other = $this->product('Plain basket', [['stock' => [1, 0], 'price' => '2000']]);
        $this->getJson('/api/v1/products?sort=price_asc')->assertOk()->assertJsonPath('data.0.slug', $other->slug)->assertJsonPath('data.1.price_min_minor', '5000')->assertJsonPath('data.1.price_max_minor', '5000');
        $this->getJson('/api/v1/products?max_price=500')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/products?min_price=3000')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.slug', $mixed->slug);
        $detail = $this->getJson('/api/v1/products/'.$mixed->slug)->assertOk()->assertJsonPath('data.available', true)->assertJsonPath('data.price_min_minor', '100')->assertJsonCount(3, 'data.variants')->json('data');
        $availabilityByPrice = array_column($detail['variants'], 'available', 'unit_price_minor');
        $this->assertFalse($availabilityByPrice[100]);
        $this->assertTrue($availabilityByPrice[5000]);
        $this->assertFalse($availabilityByPrice[200]);
        $archived = $mixed->variants()->where('status', 'archived')->with('inventory')->firstOrFail();
        $this->assertFalse($archived->isAvailable());
    }

    public function test_replenishment_restores_browse_visibility_without_republishing_or_unarchiving(): void
    {
        $product = $this->product('Replenished basket', [['stock' => [0, 0]]]);
        $publication = $product->published_at;
        $version = $product->content_version;
        $variant = $product->variants()->firstOrFail();
        $this->getJson('/api/v1/products')->assertJsonCount(0, 'data');
        // Read projection fixture; the inventory service separately verifies production adjustment semantics.
        DB::table('inventory')->where('variant_id', $variant->id)->update(['on_hand' => 4]);
        $this->getJson('/api/v1/products')->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.slug', $product->slug);
        $this->assertSame($version, $product->fresh()->content_version);
        $this->assertTrue($publication->equalTo($product->fresh()->published_at));

        app(CatalogActions::class)->transition($product->id, $version, true);
        DB::table('inventory')->where('variant_id', $variant->id)->update(['on_hand' => 9]);
        $this->getJson('/api/v1/products')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/products/'.$product->slug)->assertNotFound();
        $this->assertSame('archived', $product->fresh()->status);
    }

    public function test_real_inventory_lifecycle_updates_storefront_without_changing_publication(): void
    {
        $this->seed(IdentityPermissionsSeeder::class);
        $owner = User::factory()->create(['password' => 'Availability-fixture-passphrase']);
        $owner->roles()->attach(Role::where('code', 'owner')->firstOrFail()->id, ['id' => (string) Str::uuid()]);
        $service = app(InventoryService::class);
        $product = $this->product('Lifecycle basket', [[]]);
        $variant = $product->variants()->firstOrFail();
        $items = [['variant_id' => $variant->id, 'quantity' => 1]];
        $assertAvailable = function (bool $available) use ($product): void {
            $this->getJson('/api/v1/products')->assertOk()->assertJsonCount($available ? 1 : 0, 'data');
            $this->getJson('/api/v1/search?q=lifecycle')->assertOk()->assertJsonCount($available ? 1 : 0, 'data');
            $this->getJson('/api/v1/products/'.$product->slug)->assertOk()->assertJsonPath('data.available', $available)->assertJsonPath('data.variants.0.available', $available);
            $this->assertSame('published', $product->fresh()->status);
            $this->assertSame($product->content_version, $product->fresh()->content_version);
        };
        $assertAvailable(false);
        $service->initializeStock($variant->id, 1, 'Launch count', (string) Str::uuid(), $owner);
        $assertAvailable(true);
        $r = $service->reserveMany((string) Str::uuid(), $items);
        $assertAvailable(false);
        $service->release($r->id);
        $assertAvailable(true);
        $r2 = $service->reserveMany($r->reference_id, $items, 2);
        $service->consume($r2->id);
        $assertAvailable(false);
        $stock = Inventory::where('variant_id', $variant->id)->firstOrFail();
        $service->adjustStock($variant->id, 1, 'Reconciled count', (string) Str::uuid(), $owner, $stock->version);
        $assertAvailable(true);
        config(['inventory.reservation_ttl_seconds' => 1]);
        $r3 = $service->reserveMany((string) Str::uuid(), $items);
        $assertAvailable(false);
        usleep(1100000);
        $service->expire($r3->id);
        $assertAvailable(true);
        app(CatalogActions::class)->transition($product->id, $product->content_version, true);
        $stock->refresh();
        $service->adjustStock($variant->id, 1, 'Warehouse count after archival', (string) Str::uuid(), $owner, $stock->version);
        $this->getJson('/api/v1/products')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/products/'.$product->slug)->assertNotFound();
    }

    public function test_availability_eager_loading_has_constant_query_count(): void
    {
        $this->product('First basket', [['stock' => [3, 1]], ['stock' => [0, 0]]]);
        $this->product('Second basket', [['stock' => [2, 0]], []]);
        DB::enableQueryLog();
        $this->getJson('/api/v1/products')->assertOk()->assertJsonPath('meta.total', 2);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $catalog = array_filter($queries, fn (array $query): bool => str_starts_with($query['query'], 'select') && preg_match('/"(products|product_variants|categories|product_options|option_values|product_media|variant_option_values|inventory)"/', $query['query']) === 1);
        $this->assertLessThanOrEqual(10, count($catalog));
        $inventoryLoads = array_filter($queries, fn (array $query): bool => str_starts_with($query['query'], 'select * from "inventory"'));
        $this->assertCount(1, $inventoryLoads);
    }
}
