<?php

namespace Tests\Infrastructure;

use App\Catalog\MediaStorage;
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
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class CatalogTest extends TestCase
{
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

    private function image(array $p, string $content = '', string $mime = 'image/png'): string
    {
        if ($content === '') {
            $im = imagecreatetruecolor(40, 30);
            ob_start();
            imagepng($im);
            $content = ob_get_clean();
        }
        $intent = $this->browser('POST', '/api/v1/admin/media/uploads', ['product_id' => $p['id'], 'mime_type' => $mime, 'byte_size' => strlen($content), 'checksum' => hash('sha256', $content), 'alt_text' => 'Test woven basket'])->assertCreated()->json('data');
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
        $this->browser('GET', $public['media'][0]['sources'][0]['url'])->assertOk()->assertHeader('Content-Type', 'image/webp');
        $updated = $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['name' => 'Changed name', 'content_version' => $p['content_version']])->assertOk()->json('data');
        $this->assertSame($p['slug'], $updated['slug']);
        $this->browser('PATCH', '/api/v1/admin/products/'.$p['id'], ['name' => 'Stale', 'content_version' => $p['content_version']])->assertStatus(409);
        $this->browser('POST', '/api/v1/admin/products/'.$p['id'].'/archive', ['content_version' => $updated['content_version']])->assertOk();
        $this->browser('GET', '/api/v1/products/'.$p['slug'])->assertNotFound();
        $this->assertDatabaseHas('product_variants', ['sku' => 'BASKET-1']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'catalog.product_published', 'subject_type' => 'product', 'subject_id' => $p['id']]);
        $this->browser('DELETE', '/api/v1/admin/products/'.$p['id'])->assertStatus(405);
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
}
