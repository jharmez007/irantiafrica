<?php

namespace Tests\Infrastructure;

use App\Catalog\MediaStorage;
use App\Inventory\InventoryService;
use App\Jobs\ProcessProductImage;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\CatalogTaxFixture;
use Tests\TestCase;

final class CatalogTest extends TestCase
{
    use CatalogTaxFixture;

    private array $jar = [];

    private const PASSWORD = 'Catalog-test-passphrase';

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL/Redis.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->configureCatalogTax();
        config(['session.driver' => 'database', 'session.secure' => false, 'session.encrypt' => true, 'cors.allowed_origins' => ['http://localhost:3000'], 'sanctum.stateful' => ['localhost:3000'], 'cache.prefix' => 'catalog-test-'.bin2hex(random_bytes(8)), 'hashing.bcrypt.rounds' => 4, 'catalog.disk' => 'local']);
        $this->app['hash']->forgetDrivers();
        $this->seed(IdentityPermissionsSeeder::class);
        Notification::fake();
        Storage::fake('local');
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    private function browser(string $method, string $path, array $data = [], bool $csrf = true): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('auth.driver');
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => 'http://localhost:3000', 'HTTP_REFERER' => 'http://localhost:3000/', 'CONTENT_TYPE' => 'application/json'];
        if ($csrf && isset($this->jar['XSRF-TOKEN'])) {
            $server['HTTP_X_XSRF_TOKEN'] = $this->jar['XSRF-TOKEN'];
        }
        $response = $this->call($method, $path, [], $this->jar, [], $server, json_encode($data));
        foreach ($response->headers->getCookies() as $cookie) {
            $this->jar[$cookie->getName()] = $cookie->getValue();
        }

        return $response;
    }

    private function staff(string $role = 'owner'): User
    {
        $user = User::factory()->create(['password' => self::PASSWORD])->refresh();
        $user->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['id' => (string) Str::uuid()]);

        return $user;
    }

    private function login(User $user): TestResponse
    {
        return $this->browser('POST', '/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD]);
    }

    private function enroll(User $user): array
    {
        $this->login($user)->assertOk()->assertJsonPath('data.authentication_state', 'enrollment_required');
        $setup = $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertOk()->json('data');
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $setup['qr']);
        $code = (new Google2FA)->oathTotp($setup['secret'], (new Google2FA)->getTimestamp());
        $codes = $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => $code])->assertOk()->json('data.recovery_codes');

        return [$setup['secret'], $codes, $code];
    }

    private function owner(): void
    {
        $this->enroll($this->staff());
    }

    private function create(string $kind = 'simple', string $name = 'Woven basket'): array
    {
        $category = $this->browser('POST', '/api/v1/admin/categories', ['name' => 'Home', 'status' => 'active'])->assertCreated()->json('data.id');

        return $this->browser('POST', '/api/v1/admin/products', ['name' => $name, 'kind' => $kind, 'description' => 'Handmade test product.', 'tax_category_code' => 'unconfigured-test', 'category_ids' => [$category]])->assertCreated()->json('data');
    }

    private function variant(array $p, string $sku = 'BASKET-1', array $values = [], string $price = '125000'): array
    {
        return $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => $sku, 'unit_price_minor' => $price, 'option_value_ids' => $values])->assertOk()->json('data');
    }

    private function image(array $p, string $content = '', string $mime = 'image/png', ?string $variantId = null): string
    {
        if ($content === '') {
            $im = imagecreatetruecolor(40, 30);
            ob_start();
            imagepng($im);
            $content = ob_get_clean();
        }
        $intent = $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $p['id'], 'variant_id' => $variantId, 'mime_type' => $mime, 'byte_size' => strlen($content), 'checksum' => hash('sha256', $content), 'alt_text' => 'Test woven basket'])->assertCreated()->json('data');
        $m = ProductMedia::findOrFail($intent['id']);
        Storage::disk('local')->put($m->object_key, $content);
        $this->browser('POST', '/api/v1/admin/media/'.$m->id.'/complete')->assertStatus(202);

        return $m->id;
    }

    private function publish(array $p): array
    {
        return $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => Product::findOrFail($p['id'])->content_version])->assertOk()->json('data');
    }

    private function stockFixture(array $product): void
    {
        // Catalog projection fixture only; production balances use the inventory command service.
        foreach ($product['variants'] as $variant) {
            DB::table('inventory')->insert(['id' => (string) Str::uuid(), 'variant_id' => $variant['id'], 'on_hand' => 1, 'reserved' => 0, 'low_stock_threshold' => 0, 'version' => 1]);
        }
    }

    public function test_owner_can_delete_only_unused_draft_with_options_variants_and_audit_retained(): void
    {
        $this->owner();
        $p = $this->create('variant', 'Disposable draft');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Size', 'values' => ['Small']])->assertOk()->json('data');
        $option = $p['options'][0];
        $p = $this->variant($p, 'DISPOSABLE-1', [$option['values'][0]['id']]);
        $variantId = $p['variants'][0]['id'];
        $categoryId = $p['category_ids'][0];

        $this->browser('DELETE', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version'] - 1])->assertStatus(409);
        $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->assertJsonPath('data.delete_eligibility.allowed', true);
        $this->browser('DELETE', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version']])->assertNoContent();
        foreach (['products' => $p['id'], 'product_options' => $option['id'], 'option_values' => $option['values'][0]['id'], 'product_variants' => $variantId] as $table => $id) {
            $this->assertDatabaseMissing($table, ['id' => $id]);
        }
        $this->assertDatabaseMissing('product_categories', ['product_id' => $p['id']]);
        $this->assertDatabaseMissing('variant_option_values', ['variant_id' => $variantId]);
        $this->assertDatabaseHas('categories', ['id' => $categoryId]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.product_deleted', 'subject_id' => $p['id']]);
    }

    public function test_product_deletion_blocks_media_inventory_and_archived_history(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $p = $this->create();
        $p = $this->variant($p, 'KEEP-HISTORY-1');
        app(InventoryService::class)->initializeStock($p['variants'][0]['id'], 1, 'Deletion safety test', (string) Str::uuid(), $owner);
        $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->assertJsonPath('data.delete_eligibility.allowed', false);
        $this->browser('DELETE', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version']])->assertUnprocessable();
        $this->assertDatabaseHas('products', ['id' => $p['id']]);
        $this->assertDatabaseHas('inventory_movements', ['variant_id' => $p['variants'][0]['id']]);

        $mediaProduct = $this->create('simple', 'Media draft');
        $this->image($mediaProduct);
        $this->browser('DELETE', '/api/v1/admin/products/'.$mediaProduct['id'], ['content_version' => Product::findOrFail($mediaProduct['id'])->content_version])->assertUnprocessable();
        $this->assertDatabaseHas('products', ['id' => $mediaProduct['id']]);

        $archived = $this->create('simple', 'Archived draft');
        $this->browser('POST', '/api/v1/admin/products/'.$archived['id'].'/archive', ['content_version' => $archived['content_version']])->assertOk();
        $this->browser('DELETE', '/api/v1/admin/products/'.$archived['id'], ['content_version' => Product::findOrFail($archived['id'])->content_version])->assertUnprocessable();

        $cartProduct = $this->variant($this->create('simple', 'Cart-linked draft'), 'KEEP-CART-1');
        $cartId = (string) Str::uuid();
        $cartItemId = (string) Str::uuid();
        DB::table('carts')->insert(['id' => $cartId, 'guest_token_hash' => hash('sha256', 'catalog-delete-test'), 'expires_at' => now()->addDays(30)]);
        DB::table('cart_items')->insert(['id' => $cartItemId, 'cart_id' => $cartId, 'variant_id' => $cartProduct['variants'][0]['id'], 'quantity' => 1]);
        $this->browser('DELETE', '/api/v1/admin/products/'.$cartProduct['id'], ['content_version' => $cartProduct['content_version']])->assertUnprocessable();
        $this->assertDatabaseHas('cart_items', ['id' => $cartItemId]);
        $this->assertDatabaseHas('products', ['id' => $cartProduct['id']]);
    }

    public function test_category_deletion_requires_no_assignments_or_children_and_owner_permission(): void
    {
        $this->owner();
        $p = $this->create();
        $assigned = $p['category_ids'][0];
        $this->browser('DELETE', '/api/v1/admin/categories/'.$assigned)->assertUnprocessable()->assertJsonPath('error.fields.category.0', 'This category cannot be deleted while products are assigned to it.');
        $this->assertDatabaseHas('product_categories', ['product_id' => $p['id'], 'category_id' => $assigned]);

        $parent = $this->browser('POST', '/api/v1/admin/categories', ['name' => 'Empty parent'])->assertCreated()->json('data.id');
        $child = $this->browser('POST', '/api/v1/admin/categories', ['name' => 'Empty child', 'parent_id' => $parent])->assertCreated()->json('data.id');
        $this->browser('DELETE', '/api/v1/admin/categories/'.$parent)->assertUnprocessable();
        $this->browser('DELETE', '/api/v1/admin/categories/'.$child)->assertNoContent();
        $this->browser('DELETE', '/api/v1/admin/categories/'.$parent)->assertNoContent();
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.category_deleted', 'subject_id' => $parent]);
        $this->assertDatabaseHas('products', ['id' => $p['id']]);
    }

    public function test_non_owner_staff_cannot_delete_products_or_categories(): void
    {
        $this->owner();
        $p = $this->create();
        $category = $this->browser('POST', '/api/v1/admin/categories', ['name' => 'Standalone'])->assertCreated()->json('data.id');
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->enroll($this->staff('order_processing'));
        $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->assertJsonPath('data.delete_eligibility', null);
        $this->browser('GET', '/api/v1/admin/categories')->assertOk()->assertJsonMissingPath('data.0.delete_eligibility');
        $this->browser('DELETE', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version']])->assertForbidden();
        $this->browser('DELETE', '/api/v1/admin/categories/'.$category)->assertForbidden();
        $this->assertDatabaseHas('products', ['id' => $p['id']]);
        $this->assertDatabaseHas('categories', ['id' => $category]);
    }

    public function test_async_media_version_refresh_publication_and_stock_visibility(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $p = $this->create();
        $this->assertNotEmpty($p['publication_issues']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $p['content_version']])->assertUnprocessable();
        $p = $this->variant($p);
        Queue::fake();
        $media = $this->image($p);
        $pending = $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->json('data');
        $this->assertNotEmpty($pending['publication_issues']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $pending['content_version']])->assertUnprocessable();
        app()->call([new ProcessProductImage($media), 'handle']);
        app(InventoryService::class)->initializeStock($p['variants'][0]['id'], 3, 'UAT opening stock', (string) Str::uuid(), $owner);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $pending['content_version']])->assertStatus(409);
        $fresh = $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->json('data');
        $this->assertSame([], $fresh['publication_issues']);
        $this->assertSame(3, $fresh['variants'][0]['inventory']['available']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $fresh['content_version']])->assertOk();
        $this->browser('GET', '/api/v1/products')->assertOk()->assertJsonPath('data.0.slug', $p['slug']);
        $this->browser('GET', '/api/v1/admin/products?status=published')->assertOk()->assertJsonPath('meta.total', 1);
        $this->browser('GET', '/api/v1/admin/products?status=draft')->assertOk()->assertJsonPath('meta.total', 0);
        $this->browser('GET', '/api/v1/products?status=draft')->assertUnprocessable();
        $this->browser('GET', '/api/v1/admin/tax-categories')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_simple_product_lifecycle_slug_money_publication_and_audit(): void
    {
        $this->owner();
        $p = $this->create();
        $this->assertSame('woven-basket', $p['slug']);
        $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertNotFound();
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $p['content_version']])->assertUnprocessable();
        $p = $this->variant($p, '  basket-1  ');
        $this->assertSame('BASKET-1', $p['variants'][0]['sku']);
        $this->assertSame('125000', $p['variants'][0]['unit_price_minor']);
        $m = $this->image($p);
        $this->assertSame('ready', ProductMedia::findOrFail($m)->status);
        $p = $this->publish($p);
        $public = $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertOk()->json('data');
        $this->assertArrayNotHasKey('tax_category_code', $public);
        $this->assertArrayNotHasKey('status', $public);
        $this->assertArrayNotHasKey('id', $public);
        $this->assertArrayNotHasKey('object_key', $public['media'][0]);
        $this->assertArrayNotHasKey('sku', $public['variants'][0]);
        $this->browser('GET', $public['media'][0]['sources'][0]['url'])->assertOk()->assertHeader('Content-Type', 'image/webp');
        $updated = $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['name' => 'Changed name', 'content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertSame($p['slug'], $updated['slug']);
        $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['name' => 'Stale', 'content_version' => $p['content_version']])->assertStatus(409);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/archive', ['content_version' => $updated['content_version']])->assertOk();
        $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertNotFound();
        $this->assertDatabaseHas('product_variants', ['sku' => 'BASKET-1']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.product_published', 'subject_type' => 'product', 'subject_id' => $p['id']]);
        $this->browser('DELETE', '/api/v1/admin/products/'.$p['id'], ['content_version' => Product::findOrFail($p['id'])->content_version])->assertUnprocessable();
        $this->assertDatabaseHas('products', ['id' => $p['id'], 'status' => 'archived']);
    }

    public function test_public_variant_availability_uses_configured_threshold_without_internal_balances(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $product = $this->variant($this->create(), 'PUBLIC-STOCK-1');
        $variantId = $product['variants'][0]['id'];
        $this->image($product);
        $inventory = app(InventoryService::class);
        $inventory->initializeStock($variantId, 8, 'Public availability test', (string) Str::uuid(), $owner);
        $inventory->setLowStockThreshold($variantId, 5, $owner);
        $this->publish($product);

        $public = $this->browser('GET', '/api/v1/products/'.$product['slug'])->assertOk()->json('data');
        $this->assertSame(8, $public['variants'][0]['available_quantity']);
        $this->assertSame('in_stock', $public['variants'][0]['availability_status']);
        $this->assertFalse($public['variants'][0]['low_stock']);
        foreach (['inventory', 'reserved', 'on_hand', 'movements'] as $privateField) {
            $this->assertArrayNotHasKey($privateField, $public['variants'][0]);
        }

        $inventory->reserveMany((string) Str::uuid(), [['variant_id' => $variantId, 'quantity' => 4]]);
        $public = $this->browser('GET', '/api/v1/products/'.$product['slug'])->assertOk()->json('data');
        $this->assertSame(4, $public['variants'][0]['available_quantity']);
        $this->assertSame('low_stock', $public['variants'][0]['availability_status']);
        $this->assertTrue($public['variants'][0]['low_stock']);

        $inventory->reserveMany((string) Str::uuid(), [['variant_id' => $variantId, 'quantity' => 4]]);
        $this->browser('GET', '/api/v1/products/'.$product['slug'])->assertOk()
            ->assertJsonPath('data.variants.0.available_quantity', 0)
            ->assertJsonPath('data.variants.0.availability_status', 'out_of_stock')
            ->assertJsonPath('data.variants.0.available', false);
        $this->browser('GET', '/api/v1/products')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_variant_media_assignment_reassignment_fallback_and_bounded_public_read(): void
    {
        $this->owner();
        $p = $this->create('variant', 'Colour textile');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Colour', 'values' => ['Forest Green', 'Terracotta']])->assertOk()->json('data');
        $green = $p['options'][0]['values'][0]['id'];
        $clay = $p['options'][0]['values'][1]['id'];
        $p = $this->variant($p, 'TEXTILE-GREEN', [$green]);
        $p = $this->variant($p, 'TEXTILE-CLAY', [$clay]);
        $greenId = collect($p['variants'])->first(fn (array $variant): bool => in_array($green, $variant['option_value_ids'], true))['id'];
        $clayId = collect($p['variants'])->first(fn (array $variant): bool => in_array($clay, $variant['option_value_ids'], true))['id'];
        $general = $this->image($p);
        $greenFront = $this->image($p, '', 'image/png', $greenId);
        $greenDetail = $this->image($p, '', 'image/png', $greenId);
        $this->assertDatabaseHas('product_media', ['id' => $general, 'variant_id' => null]);
        $this->assertDatabaseHas('product_media', ['id' => $greenFront, 'variant_id' => $greenId]);
        $this->assertDatabaseHas('product_media', ['id' => $greenDetail, 'variant_id' => $greenId]);
        $other = $this->variant($this->create(), 'OTHER-MEDIA');
        $this->browser('PATCH', '/api/v1/admin/media/'.$greenFront, ['variant_id' => $other['variants'][0]['id']])->assertUnprocessable();
        $this->assertDatabaseHas('product_media', ['id' => $greenFront, 'variant_id' => $greenId]);
        $this->browser('PATCH', '/api/v1/admin/media/'.$greenFront, ['variant_id' => $clayId])->assertOk();
        $this->assertDatabaseHas('product_media', ['id' => $greenFront, 'variant_id' => $clayId]);
        $this->browser('PATCH', '/api/v1/admin/media/'.$greenFront, ['variant_id' => null])->assertOk();
        $this->assertDatabaseHas('product_media', ['id' => $greenFront, 'variant_id' => null]);
        $this->stockFixture($p);
        $this->publish($p);
        DB::enableQueryLog();
        $public = $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertOk()->json('data');
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(3, $public['media']);
        $this->assertSame($greenId, collect($public['media'])->firstWhere('id', $greenDetail)['variant_id']);
        $this->assertArrayNotHasKey('sku', $public['variants'][0]);
        $this->assertLessThanOrEqual(2, count(array_filter($queries, fn (array $query): bool => str_contains($query['query'], 'from "product_media"'))));
        $admin = $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->json('data');
        $this->assertNotEmpty($admin['variants'][0]['sku']);
        $this->browser('DELETE', '/api/v1/admin/media/'.$greenDetail)->assertNoContent();
        $this->assertDatabaseHas('product_media', ['id' => $general, 'status' => 'ready', 'variant_id' => null]);
        $this->assertDatabaseHas('product_media', ['id' => $greenDetail, 'status' => 'retired', 'variant_id' => $greenId]);
        $this->enroll($this->staff('inventory_store'));
        $this->browser('PATCH', '/api/v1/admin/media/'.$greenFront, ['variant_id' => $clayId])->assertForbidden();
        $this->browser('DELETE', '/api/v1/admin/media/'.$greenFront)->assertForbidden();
    }

    public function test_generic_variants_duplicate_combinations_skus_and_foreign_values(): void
    {
        $this->owner();
        $p = $this->create('variant');
        foreach ([['Material', ['Cotton', 'Linen']], ['Finish', ['Natural', 'Dyed']]] as [$name,$values]) {
            $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => $name, 'values' => $values])->assertOk()->json('data');
        }
        $values = [$p['options'][0]['values'][0]['id'], $p['options'][1]['values'][0]['id']];
        $p = $this->variant($p, 'GENERIC-1', $values, '10000');
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => 'GENERIC-2', 'unit_price_minor' => '20000', 'option_value_ids' => array_reverse($values)])->assertUnprocessable();
        $values2 = [$p['options'][0]['values'][1]['id'], $p['options'][1]['values'][0]['id']];
        $p = $this->variant($p, 'GENERIC-2', $values2, '20000');
        $this->assertSame('10000', $p['price_min_minor']);
        $this->assertSame('20000', $p['price_max_minor']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => 'MISSING', 'unit_price_minor' => '1', 'option_value_ids' => [$values[0]]])->assertUnprocessable();
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Later', 'values' => ['No']])->assertStatus(409);
        $other = $this->create();
        $this->browser('POST', '/api/v1/admin/products/'.$other['id'].'/variants', ['sku' => 'generic-1', 'unit_price_minor' => '100', 'option_value_ids' => []])->assertUnprocessable();
        $this->browser('POST', '/api/v1/admin/products/'.$other['id'].'/variants', ['sku' => 'FOREIGN', 'unit_price_minor' => '100', 'option_value_ids' => $values])->assertUnprocessable();
    }

    public function test_colour_swatches_are_validated_editable_and_do_not_change_variant_identity(): void
    {
        $this->owner();
        $p = $this->create('variant', 'Swatch bag');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Colour', 'values' => [
            ['value' => 'Forest Green', 'swatch_hex' => '  #335438  '],
            ['value' => 'Ivory', 'swatch_hex' => null],
        ]])->assertOk()->json('data');
        $option = $p['options'][0];
        $green = $option['values'][0];
        $this->assertSame('#335438', $green['swatch_hex']);
        $this->assertNull($option['values'][1]['swatch_hex']);
        $this->browser('POST', '/api/v1/admin/options/'.$option['id'].'/values', ['values' => [['value' => 'Unsafe', 'swatch_hex' => 'url(javascript:alert(1))']]])->assertUnprocessable();
        $p = $this->variant($p, 'SWATCH-GREEN', [$green['id']], '3900000');
        $variant = $p['variants'][0];
        $this->stockFixture($p);
        $mediaId = $this->image($p, '', 'image/png', $variant['id']);
        $p = $this->publish($p);
        $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green['id'].'/swatch', ['swatch_hex' => 'rgb(0,0,0)', 'content_version' => $p['content_version']])->assertUnprocessable();
        $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green['id'].'/swatch', ['swatch_hex' => '#111111', 'content_version' => $p['content_version'] - 1])->assertStatus(409);
        $p = $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green['id'].'/swatch', ['swatch_hex' => ' #a65a32 ', 'content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertSame('#A65A32', $p['options'][0]['values'][0]['swatch_hex']);
        $this->assertSame($variant['id'], $p['variants'][0]['id']);
        $this->assertSame('SWATCH-GREEN', $p['variants'][0]['sku']);
        $this->assertSame('3900000', $p['variants'][0]['unit_price_minor']);
        $this->assertSame($mediaId, $p['media'][0]['id']);
        $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertOk()->assertJsonPath('data.options.0.values.0.swatch_hex', '#A65A32');
        $this->assertDatabaseHas('inventory', ['variant_id' => $variant['id'], 'on_hand' => 1, 'reserved' => 0]);
        $this->assertSame(0, DB::table('inventory_movements')->where('variant_id', $variant['id'])->count());
        $p = $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green['id'].'/swatch', ['swatch_hex' => null, 'content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertNull($p['options'][0]['values'][0]['swatch_hex']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.option_value_swatch_updated', 'subject_id' => $p['id']]);

        $size = $this->create('variant', 'Size only');
        $size = $this->browser('POST', '/api/v1/admin/products/'.$size['id'].'/options', ['name' => 'Paper Size', 'values' => ['A4']])->assertOk()->json('data');
        $sizeOption = $size['options'][0];
        $this->browser('PATCH', '/api/v1/admin/options/'.$sizeOption['id'].'/values/'.$sizeOption['values'][0]['id'].'/swatch', ['swatch_hex' => '#FFFFFF', 'content_version' => $size['content_version']])->assertUnprocessable();
        $this->browser('POST', '/api/v1/admin/products/'.$size['id'].'/options', ['name' => 'Size', 'values' => [['value' => 'Large', 'swatch_hex' => '#111111']]])->assertUnprocessable();
        $this->enroll($this->staff('inventory_store'));
        $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green['id'].'/swatch', ['swatch_hex' => '#000000', 'content_version' => $p['content_version']])->assertForbidden();
    }

    public function test_colour_value_names_cannot_duplicate_after_case_or_whitespace_normalisation(): void
    {
        $this->owner();
        $product = $this->create('variant', 'Unique colours');
        $path = '/api/v1/admin/products/'.$product['id'].'/options';
        $this->browser('POST', $path, ['name' => 'Colour', 'values' => ['Cognac', '  cOgNaC  ']])->assertUnprocessable();
        $this->assertDatabaseMissing('product_options', ['product_id' => $product['id']]);

        $product = $this->browser('POST', $path, ['name' => 'Colour', 'values' => ['Forest Green', 'Cognac']])->assertOk()->json('data');
        $option = $product['options'][0];
        $this->browser('POST', '/api/v1/admin/options/'.$option['id'].'/values', ['values' => [' forest   GREEN ']])
            ->assertUnprocessable()
            ->assertJsonPath('error.fields.values.0', 'forest GREEN has already been added.');
        $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$option['values'][1]['id'], [
            'value' => ' FOREST   GREEN ', 'swatch_hex' => null, 'content_version' => $product['content_version'],
        ])->assertUnprocessable()->assertJsonPath('error.fields.value.0', 'FOREST GREEN has already been added.');
        $this->assertDatabaseCount('option_values', 2);
    }

    public function test_draft_option_removal_is_versioned_and_saved_variants_are_only_removed_from_sale(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $p = $this->create('variant');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Size', 'values' => ['Small', 'Large', 'XL']])->assertOk()->json('data');
        $size = $p['options'][0];
        $removedValue = $size['values'][2]['id'];
        $staleVersion = $p['content_version'];
        $p = $this->browser('DELETE', '/api/v1/admin/options/'.$size['id'].'/values/'.$removedValue, ['content_version' => $staleVersion])->assertOk()->json('data');
        $this->assertCount(2, $p['options'][0]['values']);
        $this->assertDatabaseMissing('option_values', ['id' => $removedValue]);
        $this->browser('DELETE', '/api/v1/admin/options/'.$size['id'], ['content_version' => $staleVersion])->assertStatus(409);
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Colour', 'values' => ['Red', 'Blue']])->assertOk()->json('data');
        $colour = $p['options'][1];
        $p = $this->browser('DELETE', '/api/v1/admin/options/'.$colour['id'], ['content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertCount(1, $p['options']);
        $this->assertDatabaseMissing('product_options', ['id' => $colour['id']]);
        $p = $this->variant($p, 'SIZE-SMALL', [$p['options'][0]['values'][0]['id']], '450000');
        $variant = $p['variants'][0];
        app(InventoryService::class)->initializeStock($variant['id'], 2, 'Catalog removal history test', (string) Str::uuid(), $owner);
        $this->browser('GET', '/api/v1/admin/options/'.$size['id'].'/values/'.$size['values'][0]['id'].'/removal-preview')->assertOk()->assertJsonPath('data.mode', 'archive');
        $p = $this->browser('DELETE', '/api/v1/admin/options/'.$size['id'].'/values/'.$size['values'][0]['id'], ['content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertTrue($p['options'][0]['values'][0]['removed']);
        $this->assertSame('archived', $p['variants'][0]['status']);
        $this->browser('DELETE', '/api/v1/admin/options/'.$size['id'], ['content_version' => $p['content_version']])->assertStatus(409);
        $this->browser('DELETE', '/api/v1/admin/variants/'.$variant['id'])->assertStatus(405);
        $this->browser('PATCH', '/api/v1/admin/variants/'.$variant['id'], ['status' => 'active', 'price_version' => $p['variants'][0]['price_version']])->assertUnprocessable();
        $this->assertDatabaseHas('product_variants', ['id' => $variant['id'], 'sku' => 'SIZE-SMALL', 'status' => 'archived']);
        $this->assertDatabaseHas('option_values', ['id' => $size['values'][0]['id']]);
        $this->assertDatabaseHas('inventory_movements', ['variant_id' => $variant['id']]);
        $this->assertFalse(ProductVariant::findOrFail($variant['id'])->load('inventory')->isAvailable());
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => 'SIZE-SMALL-2', 'unit_price_minor' => '450000', 'option_value_ids' => [$size['values'][0]['id']]])->assertUnprocessable();
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.option_value_removed', 'subject_id' => $p['id']]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.option_removed', 'subject_id' => $p['id']]);
    }

    public function test_unused_draft_colour_removal_reassigns_media_and_cart_references_force_archival(): void
    {
        $this->owner();
        $p = $this->create('variant', 'Removable colours');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Colour', 'values' => ['Forest Green', 'Cognac']])->assertOk()->json('data');
        $option = $p['options'][0];
        $green = $option['values'][0]['id'];
        $cognac = $option['values'][1]['id'];
        $p = $this->variant($p, 'REMOVE-GREEN', [$green]);
        $p = $this->variant($p, 'KEEP-COGNAC', [$cognac]);
        $greenId = collect($p['variants'])->firstWhere('sku', 'REMOVE-GREEN')['id'];
        $cognacId = collect($p['variants'])->firstWhere('sku', 'KEEP-COGNAC')['id'];
        $mediaId = $this->image($p, '', 'image/png', $greenId);
        $p = $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->assertOk()->json('data');
        $preview = $this->browser('GET', '/api/v1/admin/options/'.$option['id'].'/values/'.$green.'/removal-preview')->assertOk()->json('data');
        $this->assertSame('delete', $preview['mode']);
        $this->assertSame(1, $preview['media_count']);
        $this->assertSame(['REMOVE-GREEN'], array_column($preview['variants'], 'sku'));
        $this->browser('DELETE', '/api/v1/admin/options/'.$option['id'].'/values/'.$green, ['content_version' => $p['content_version']])->assertUnprocessable();
        $p = $this->browser('DELETE', '/api/v1/admin/options/'.$option['id'].'/values/'.$green, ['content_version' => $p['content_version'], 'reassign_variant_media' => true])->assertOk()->json('data');
        $this->assertDatabaseMissing('option_values', ['id' => $green]);
        $this->assertDatabaseMissing('product_variants', ['id' => $greenId]);
        $this->assertDatabaseMissing('variant_option_values', ['variant_id' => $greenId]);
        $this->assertDatabaseHas('product_media', ['id' => $mediaId, 'variant_id' => null, 'status' => 'ready']);
        $this->assertDatabaseHas('product_variants', ['id' => $cognacId, 'status' => 'active']);

        $cartId = (string) Str::uuid();
        $cartItemId = (string) Str::uuid();
        DB::table('carts')->insert(['id' => $cartId, 'guest_token_hash' => hash('sha256', 'colour-removal-cart'), 'expires_at' => now()->addDays(30)]);
        DB::table('cart_items')->insert(['id' => $cartItemId, 'cart_id' => $cartId, 'variant_id' => $cognacId, 'quantity' => 1]);
        $this->browser('GET', '/api/v1/admin/options/'.$option['id'].'/values/'.$cognac.'/removal-preview')->assertOk()->assertJsonPath('data.mode', 'archive');
        $p = $this->browser('DELETE', '/api/v1/admin/options/'.$option['id'].'/values/'.$cognac, ['content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertTrue($p['options'][0]['values'][0]['removed']);
        $this->assertDatabaseHas('cart_items', ['id' => $cartItemId, 'variant_id' => $cognacId]);
        $this->assertDatabaseHas('product_variants', ['id' => $cognacId, 'sku' => 'KEEP-COGNAC', 'status' => 'archived']);
    }

    public function test_published_colour_edit_and_removal_preserve_stock_media_and_other_skus(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $p = $this->create('variant', 'Published colours');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Colour', 'values' => ['Forest Green', 'Cognac']])->assertOk()->json('data');
        $option = $p['options'][0];
        $green = $option['values'][0]['id'];
        $cognac = $option['values'][1]['id'];
        $p = $this->variant($p, 'PUB-GREEN', [$green], '3900000');
        $p = $this->variant($p, 'PUB-COGNAC', [$cognac], '3900000');
        $greenId = collect($p['variants'])->firstWhere('sku', 'PUB-GREEN')['id'];
        $cognacId = collect($p['variants'])->firstWhere('sku', 'PUB-COGNAC')['id'];
        app(InventoryService::class)->initializeStock($greenId, 8, 'Colour history test', (string) Str::uuid(), $owner);
        app(InventoryService::class)->initializeStock($cognacId, 6, 'Colour history test', (string) Str::uuid(), $owner);
        $this->image($p);
        $specific = $this->image($p, '', 'image/png', $greenId);
        $p = $this->publish($p);
        $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green, ['value' => 'Cognac', 'swatch_hex' => '#335438', 'content_version' => $p['content_version']])->assertUnprocessable();
        $p = $this->browser('PATCH', '/api/v1/admin/options/'.$option['id'].'/values/'.$green, ['value' => 'Deep Forest', 'swatch_hex' => ' #335438 ', 'content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertSame($greenId, collect($p['variants'])->firstWhere('sku', 'PUB-GREEN')['id']);
        $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertOk()->assertJsonPath('data.options.0.values.0.value', 'Deep Forest')->assertJsonPath('data.options.0.values.0.swatch_hex', '#335438');
        $this->browser('GET', '/api/v1/admin/options/'.$option['id'].'/values/'.$green.'/removal-preview')->assertOk()->assertJsonPath('data.mode', 'archive')->assertJsonPath('data.variants.0.sku', 'PUB-GREEN');
        $p = $this->browser('DELETE', '/api/v1/admin/options/'.$option['id'].'/values/'.$green, ['content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertTrue($p['options'][0]['values'][0]['removed']);
        $this->assertSame('archived', collect($p['variants'])->firstWhere('sku', 'PUB-GREEN')['status']);
        $this->assertSame('active', collect($p['variants'])->firstWhere('sku', 'PUB-COGNAC')['status']);
        $this->assertDatabaseHas('inventory', ['variant_id' => $greenId, 'on_hand' => 8, 'reserved' => 0]);
        $this->assertDatabaseHas('inventory_movements', ['variant_id' => $greenId]);
        $this->assertDatabaseHas('product_media', ['id' => $specific, 'variant_id' => $greenId, 'status' => 'ready']);
        $public = $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertOk()->json('data');
        $this->assertSame(['Cognac'], array_column($public['options'][0]['values'], 'value'));
        $this->assertSame([$cognacId], array_column($public['variants'], 'id'));
        $this->assertNotContains($specific, array_column($public['media'], 'id'));
        $this->browser('GET', '/api/v1/admin/options/'.$option['id'].'/values/'.$cognac.'/removal-preview')->assertOk()->assertJsonPath('data.allowed', false);
        $this->browser('DELETE', '/api/v1/admin/options/'.$option['id'].'/values/'.$cognac, ['content_version' => $p['content_version']])->assertUnprocessable();
        $this->browser('PATCH', '/api/v1/admin/variants/'.$greenId, ['status' => 'active', 'price_version' => collect($p['variants'])->firstWhere('sku', 'PUB-GREEN')['price_version']])->assertUnprocessable();
    }

    public function test_category_hierarchy_memberships_and_cycle_prevention(): void
    {
        $this->owner();
        $p = $this->create();
        $first = $p['category_ids'][0];
        $second = $this->browser('POST', '/api/v1/admin/categories', ['name' => 'Baskets', 'parent_id' => $first, 'status' => 'active'])->assertCreated()->json('data.id');
        $this->browser('PATCH', '/api/v1/admin/categories/'.$first, ['parent_id' => $second])->assertUnprocessable();
        $p = $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version'], 'category_ids' => [$first, $second]])->assertOk()->json('data');
        $this->assertCount(2, $p['category_ids']);
        $this->browser('PATCH', '/api/v1/admin/categories/'.$second, ['name' => 'Renamed'])->assertOk()->assertJsonPath('data.slug', 'baskets');
    }

    public function test_mass_assignment_invalid_prices_and_duplicate_simple_variant(): void
    {
        $this->owner();
        $p = $this->create();
        $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version'], 'status' => 'published', 'stock' => 3])->assertUnprocessable();
        foreach (['-1', '1.5', '1e4', '1000000000000000'] as $price) {
            $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => 'TEST', 'unit_price_minor' => $price, 'option_value_ids' => []])->assertUnprocessable();
        }
        $p = $this->variant($p, 'ZERO', [], '0');
        $this->assertSame('0', $p['price_min_minor']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => 'OTHER', 'unit_price_minor' => '10', 'option_value_ids' => []])->assertUnprocessable();
    }

    public function test_all_staff_roles_and_customer_authorization_and_csrf(): void
    {
        $this->browser('GET', '/api/v1/admin/products')->assertUnauthorized();
        foreach (['inventory_store', 'order_processing'] as $role) {
            $this->enroll($this->staff($role));
            $this->browser('GET', '/api/v1/admin/products')->assertOk();
            $this->browser('POST', '/api/v1/admin/products', ['name' => 'Denied'])->assertForbidden();
            $this->browser('DELETE', '/api/v1/admin/options/'.Str::uuid(), ['content_version' => 1])->assertForbidden();
            $this->browser('POST', '/api/v1/admin/media/uploads')->assertForbidden();
            $this->browser('POST', '/api/v1/auth/logout');
        }
        $customer = User::factory()->create(['password' => self::PASSWORD]);
        $this->login($customer);
        $this->browser('GET', '/api/v1/admin/products')->assertForbidden();
        $this->browser('POST', '/api/v1/auth/logout');
        $owner = $this->staff();
        $this->login($owner);
        $this->browser('GET', '/api/v1/admin/products')->assertForbidden();
        $this->enroll($owner);
        $this->browser('POST', '/api/v1/admin/categories', ['name' => 'No CSRF'], false)->assertStatus(419);
    }

    public function test_search_pagination_category_sorting_and_eager_loading(): void
    {
        $this->owner();
        $p = $this->variant($this->create());
        $this->image($p);
        $this->publish($p);
        $this->stockFixture($p);
        $second = $this->variant($this->create('simple', 'Woven tray'), 'TRAY', [], '5000');
        $this->image($second);
        $this->publish($second);
        $this->stockFixture($second);
        $this->create('simple', 'Hidden draft');
        $this->browser('GET', '/api/v1/search?q=woven&page_size=1&sort=price_asc')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.name', 'Woven tray');
        $this->browser('GET', '/api/v1/products?category=home')->assertOk()->assertJsonPath('meta.total', 1);
        $this->browser('GET', '/api/v1/products?q=nomatch')->assertOk()->assertJsonCount(0, 'data');
        foreach (['page=0', 'page_size=101', 'sort=sql', 'min_price=-1'] as $q) {
            $this->browser('GET', '/api/v1/products?'.$q)->assertUnprocessable();
        }
        DB::enableQueryLog();
        $this->browser('GET', '/api/v1/products')->assertOk()->assertJsonPath('meta.total', 2);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $catalog = array_filter($queries, fn ($q) => str_contains($q['query'], 'select') && preg_match('/"(products|product_variants|categories|product_options|option_values|product_media|variant_option_values|inventory)"/', $q['query']));
        $this->assertLessThanOrEqual(10, count($catalog));
    }

    public function test_malicious_media_rejected_and_retirement_reorder_cleanup(): void
    {
        $this->owner();
        $p = $this->variant($this->create());
        foreach (['<svg onload="alert(1)"></svg>', '<?php echo "evil";', 'not an image'] as $bad) {
            $id = $this->image($p, $bad);
            $this->assertSame('rejected', ProductMedia::findOrFail($id)->status);
        }
        $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $p['id'], 'mime_type' => 'image/svg+xml', 'byte_size' => 1, 'checksum' => str_repeat('a', 64), 'alt_text' => 'Invalid'])->assertUnprocessable();
        $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $p['id'], 'mime_type' => 'image/png', 'byte_size' => 10485761, 'checksum' => str_repeat('a', 64), 'alt_text' => 'Too large'])->assertUnprocessable();
        $id = $this->image($p);
        $this->browser('PATCH', '/api/v1/admin/media/'.$id, ['position' => 2, 'alt_text' => 'Updated description'])->assertOk();
        $this->publish($p);
        $this->browser('DELETE', '/api/v1/admin/media/'.$id)->assertUnprocessable();
        $other = $this->image($p);
        $this->browser('DELETE', '/api/v1/admin/media/'.$id)->assertNoContent();
        $this->browser('GET', '/api/v1/media/'.$id.'/320')->assertNotFound();
        ProductMedia::whereKey($id)->update(['retired_at' => now()->subDays(8)]);
        Artisan::call('catalog:media-maintenance');
        Storage::disk('local')->assertMissing('derivatives/'.$id.'/320.webp');
        Storage::disk('local')->assertExists('derivatives/'.$other.'/320.webp');
    }

    public function test_database_constraints_cannot_be_bypassed(): void
    {
        $p = Product::factory()->create();
        $variant = ProductVariant::create(['product_id' => $p->id, 'sku' => 'INTEGRITY', 'option_signature' => '', 'unit_price_minor' => '100']);
        foreach (['UPDATE product_variants SET unit_price_minor=-1', "UPDATE product_variants SET currency='USD'", "UPDATE product_variants SET sku='lower'", "UPDATE products SET status='active'", "UPDATE products SET slug='../bad'"] as $sql) {
            try {
                DB::transaction(fn () => DB::statement($sql));
                $this->fail('Constraint should reject write');
            } catch (QueryException $e) {
                $this->assertSame('23514', $e->errorInfo[0]);
            }
        }
        $this->assertSame('100', $variant->fresh()->unit_price_minor);
    }

    public function test_signed_multipart_upload_checksum_and_processing_replay(): void
    {
        $this->owner();
        $p = $this->create();
        $file = UploadedFile::fake()->image('test.png', 50, 30);
        $bytes = file_get_contents($file->getPathname());
        $intent = $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $p['id'], 'mime_type' => 'image/png', 'byte_size' => strlen($bytes), 'checksum' => hash('sha256', $bytes), 'alt_text' => 'Test image'])->assertCreated()->json('data');
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('auth.driver');
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        $response = $this->call('POST', $intent['upload']['url'], [], $this->jar, ['file' => $file], ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => 'http://localhost:3000', 'HTTP_REFERER' => 'http://localhost:3000/', 'HTTP_X_XSRF_TOKEN' => $this->jar['XSRF-TOKEN']]);
        $response->assertOk();
        foreach ($response->headers->getCookies() as $cookie) {
            $this->jar[$cookie->getName()] = $cookie->getValue();
        }
        $this->browser('POST', '/api/v1/admin/media/'.$intent['id'].'/complete')->assertStatus(202);
        $m = ProductMedia::findOrFail($intent['id']);
        $this->assertSame('ready', $m->status);
        $this->assertCount(3, $m->derivatives);
        $image = Storage::disk('local')->get($m->derivatives[320]['key']);
        $this->assertSame('image/webp', (new \finfo(FILEINFO_MIME_TYPE))->buffer($image));
        $this->browser('POST', '/api/v1/admin/media/'.$intent['id'].'/complete')->assertStatus(202);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'catalog.media_ready')->where('subject_id', $m->id)->count());
        $this->browser('POST', '/api/v1/admin/media/'.$intent['id'].'/upload')->assertForbidden();
    }

    public function test_content_mismatch_foreign_media_and_same_product_database_foreign_keys(): void
    {
        $this->owner();
        $p = $this->variant($this->create());
        $other = $this->create();
        $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $other['id'], 'variant_id' => $p['variants'][0]['id'], 'mime_type' => 'image/png', 'byte_size' => 1, 'checksum' => str_repeat('a', 64), 'alt_text' => 'Wrong parent'])->assertUnprocessable();
        try {
            DB::transaction(fn () => ProductMedia::create(['product_id' => $other['id'], 'variant_id' => $p['variants'][0]['id'], 'object_key' => 'quarantine/foreign']));
            $this->fail('Composite FK must reject foreign variant');
        } catch (QueryException $e) {
            $this->assertSame('23503', $e->errorInfo[0]);
        }
        $intent = $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $p['id'], 'mime_type' => 'image/png', 'byte_size' => 4, 'checksum' => hash('sha256', 'good'), 'alt_text' => 'Mismatch'])->assertCreated()->json('data');
        $m = ProductMedia::findOrFail($intent['id']);
        Storage::disk('local')->put($m->object_key, 'evil');
        $this->browser('POST', '/api/v1/admin/media/'.$m->id.'/complete')->assertStatus(202);
        $this->assertSame('rejected', $m->fresh()->status);
    }

    public function test_adding_option_values_preserves_existing_combinations(): void
    {
        $this->owner();
        $p = $this->create('variant');
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/options', ['name' => 'Material', 'values' => ['Cotton']])->assertOk()->json('data');
        $option = $p['options'][0];
        $p = $this->variant($p, 'COTTON', [$option['values'][0]['id']]);
        $p = $this->browser('POST', '/api/v1/admin/options/'.$option['id'].'/values', ['values' => ['Linen']])->assertOk()->json('data');
        $this->assertCount(2, $p['options'][0]['values']);
        $this->assertSame([$option['values'][0]['id']], $p['variants'][0]['option_value_ids']);
        $this->browser('POST', '/api/v1/admin/options/'.$option['id'].'/values', ['values' => ['linen']])->assertUnprocessable();
    }

    public function test_concurrent_duplicate_combination_has_one_winner(): void
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires pcntl.');
        }
        $this->owner();
        $p = $this->create();
        $directory = sys_get_temp_dir().'/iranti-catalog-race-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        DB::disconnect();
        Redis::connection('default')->disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid === -1) {
                    $this->fail('Cannot fork');
                }
                if ($pid === 0) {
                    $deadline = microtime(true) + 5;
                    while (! file_exists($directory.'/go') && microtime(true) < $deadline) {
                        usleep(10000);
                    }
                    try {
                        $response = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/variants', ['sku' => 'RACE-'.$i, 'unit_price_minor' => '100', 'option_value_ids' => []]);
                        file_put_contents($directory.'/'.$i, (string) $response->getStatusCode());
                        DB::disconnect();
                        exit(0);
                    } catch (\Throwable) {
                        exit(1);
                    }
                }$children[] = $pid;
            }
            touch($directory.'/go');
            foreach ($children as $pid) {
                pcntl_waitpid($pid, $status);
                $this->assertSame(0, pcntl_wexitstatus($status));
            }
            $results = [file_get_contents($directory.'/0'), file_get_contents($directory.'/1')];
            sort($results);
            $this->assertSame(['200', '422'], $results);
            $this->assertSame(1, ProductVariant::where('product_id', $p['id'])->count());
        } finally {
            foreach (glob($directory.'/*') as $file) {
                unlink($file);
            }rmdir($directory);
        }
    }

    public function test_declared_pixel_bomb_is_rejected_before_decoding(): void
    {
        $this->owner();
        $p = $this->create();
        $header = pack('NNCCCCC', 100000, 100000, 8, 2, 0, 0, 0);
        $bytes = "\x89PNG\r\n\x1a\n".pack('N', 13).'IHDR'.$header.pack('N', crc32('IHDR'.$header));
        $id = $this->image($p, $bytes);
        $this->assertSame('rejected', ProductMedia::findOrFail($id)->status);
    }

    public function test_blank_description_is_allowed_for_draft_but_cannot_publish(): void
    {
        $this->owner();
        $p = $this->browser('POST', '/api/v1/admin/products', ['name' => 'Incomplete draft', 'kind' => 'simple', 'description' => '', 'tax_category_code' => 'unconfigured-test'])->assertCreated()->json('data');
        $this->assertSame('', $p['description']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $p['content_version']])->assertUnprocessable();
    }

    public function test_missing_object_does_not_mark_media_ready_and_retry_recovers(): void
    {
        $this->owner();
        $product = $this->create();
        $file = UploadedFile::fake()->image('recovery.png', 50, 30);
        $bytes = file_get_contents($file->getPathname());
        $media = ProductMedia::create(['product_id' => $product['id'], 'object_key' => 'quarantine/recovery-test', 'status' => 'processing', 'mime_type' => 'image/png', 'byte_size' => strlen($bytes), 'checksum' => hash('sha256', $bytes), 'alt_text' => 'Recovery fixture']);
        $failed = false;
        try {
            (new ProcessProductImage($media->id))->handle(app(MediaStorage::class));
        } catch (\Throwable) {
            $failed = true;
        }
        $this->assertTrue($failed);
        $this->assertSame('processing', $media->fresh()->status);
        Storage::disk('local')->put($media->object_key, $bytes);
        $job = new ProcessProductImage($media->id);
        $job->handle(app(MediaStorage::class));
        $job->handle(app(MediaStorage::class));
        $this->assertSame('ready', $media->fresh()->status);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'catalog.media_ready')->where('subject_id', $media->id)->count());
    }

    public function test_name_only_draft_and_tax_selection_are_separate_from_publication(): void
    {
        $this->owner();
        $p = $this->browser('POST', '/api/v1/admin/products', ['name' => 'Name only'])->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.tax_category_code', null)->json('data');
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => 1])->assertUnprocessable();
        $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['content_version' => 1, 'tax_category_code' => 'cheap'])->assertUnprocessable();
        $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['content_version' => 1, 'name' => 'Still incomplete'])->assertOk();
        $this->configureCatalogTax(['standard']);
        $this->browser('POST', '/api/v1/admin/products', ['name' => 'Automatic treatment'])->assertCreated()->assertJsonPath('data.tax_category_code', 'standard');
    }

    public function test_missing_tax_blocks_complete_product_publication_until_configured(): void
    {
        $this->owner();
        $p = $this->variant($this->create());
        $media = $this->image($p);
        app()->call([new ProcessProductImage($media), 'handle']);
        $p = $this->browser('GET', '/api/v1/admin/products/'.$p['id'])->json('data');
        $p = $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version'], 'tax_category_code' => null])->assertOk()->json('data');
        $this->assertSame(['Choose a configured tax treatment before publishing.'], $p['publication_issues']);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => $p['content_version']])->assertUnprocessable();
        $p = $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['content_version' => $p['content_version'], 'tax_category_code' => 'test'])->assertOk()->json('data');
        $this->publish($p);
    }

    public function test_archived_product_restores_only_to_draft_with_history_and_stock_preserved(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $p = $this->variant($this->create());
        $variantId = $p['variants'][0]['id'];
        app(InventoryService::class)->initializeStock($variantId, 8, 'Restore test', (string) Str::uuid(), $owner);
        $p = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/archive', ['content_version' => $p['content_version']])->assertOk()->json('data');
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/restore', ['content_version' => $p['content_version'] - 1])->assertStatus(409);
        $restored = $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/restore', ['content_version' => $p['content_version']])->assertOk()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.variants.0.inventory.on_hand', 8)->json('data');
        $this->assertSame($p['name'], $restored['name']);
        $this->assertSame($variantId, $restored['variants'][0]['id']);
        $this->assertSame(1, DB::table('inventory_movements')->where('variant_id', $variantId)->count());
        $this->assertNull(Product::findOrFail($p['id'])->archived_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.product_archived', 'subject_id' => $p['id']]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.product_restored', 'subject_id' => $p['id']]);
        $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertNotFound();
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/restore', ['content_version' => $restored['content_version']])->assertStatus(409);
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->enroll($this->staff('inventory_store'));
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/restore', ['content_version' => $restored['content_version']])->assertForbidden();
    }

    public function test_missing_configuration_does_not_block_draft_but_blocks_publication(): void
    {
        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->seed(IdentityPermissionsSeeder::class);
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->owner();
        $this->browser('GET', '/api/v1/admin/tax-categories')->assertOk()->assertJsonPath('data', []);
        $p = $this->browser('POST', '/api/v1/admin/products', ['name' => 'No configuration draft'])->assertCreated()->assertJsonPath('data.tax_category_code', null)->json('data');
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/publication', ['content_version' => 1])->assertUnprocessable();
        $this->browser('POST', '/api/v1/admin/products', ['name' => 'Arbitrary tax', 'tax_category_code' => 'cheap'])->assertUnprocessable();
    }
}
