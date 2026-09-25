<?php

namespace Tests\Infrastructure;

use App\Cart\CartConflict;
use App\Cart\CartService;
use App\Inventory\InventoryService;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class CartTest extends TestCase
{
    private array $jar = [];

    private User $owner;

    private const PASSWORD = 'Cart-test-customer-passphrase';

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        config(['session.driver' => 'database', 'session.secure' => false, 'session.encrypt' => true,
            'cors.allowed_origins' => ['http://localhost:3000'], 'sanctum.stateful' => ['localhost:3000'],
            'cache.limiter' => 'array', 'hashing.bcrypt.rounds' => 4, 'cart.max_quantity' => 99, 'cart.max_lines' => 100, 'cart.guest_retention_days' => 30]);
        $this->app['hash']->forgetDrivers();
        $this->seed(IdentityPermissionsSeeder::class);
        $this->owner = User::factory()->create(['password' => self::PASSWORD]);
        $this->owner->roles()->attach(Role::where('code', 'owner')->firstOrFail()->id, ['id' => (string) Str::uuid()]);
        Notification::fake();
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    private function browser(string $method, string $path, array $data = [], bool $csrf = true, string $origin = 'http://localhost:3000'): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('auth.driver');
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        // Queued cookies belong to one HTTP request; the test process reuses the container.
        foreach ($this->app['cookie']->getQueuedCookies() as $cookie) {
            $this->app['cookie']->unqueue($cookie->getName(), $cookie->getPath());
        }
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => $origin, 'HTTP_REFERER' => $origin.'/', 'CONTENT_TYPE' => 'application/json'];
        if ($csrf && isset($this->jar['XSRF-TOKEN'])) {
            $server['HTTP_X_XSRF_TOKEN'] = $this->jar['XSRF-TOKEN'];
        }
        $r = $this->call($method, $path, [], $this->jar, [], $server, json_encode($data, JSON_PRESERVE_ZERO_FRACTION));
        foreach ($r->headers->getCookies() as $cookie) {
            if ($cookie->getExpiresTime() !== 0 && $cookie->getExpiresTime() < time()) {
                unset($this->jar[$cookie->getName()]);
            } else {
                $this->jar[$cookie->getName()] = $cookie->getValue();
            }
        }

        return $r;
    }

    private function variant(int $stock = 10, string $price = '125050'): ProductVariant
    {
        $p = Product::factory()->create(['status' => 'published', 'published_at' => now()]);
        $category = Category::create(['name' => 'Home', 'slug' => 'home-'.Str::uuid(), 'status' => 'active']);
        $p->categories()->attach($category->id, ['id' => (string) Str::uuid()]);
        ProductMedia::create(['product_id' => $p->id, 'object_key' => 'test/'.Str::uuid(), 'status' => 'ready']);
        $v = ProductVariant::create(['product_id' => $p->id, 'sku' => strtoupper((string) Str::uuid()), 'option_signature' => '', 'unit_price_minor' => $price, 'status' => 'active']);
        app(InventoryService::class)->initializeStock($v->id, $stock, 'Cart fixture count', (string) Str::uuid(), $this->owner);

        return $v;
    }

    private function cartView(): array
    {
        return $this->browser('GET', '/api/v1/cart')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data');
    }

    private function add(ProductVariant $v, int $quantity = 1): TestResponse
    {
        $cart = $this->cartView();

        return $this->browser('POST', '/api/v1/cart/items', ['variant_id' => $v->id, 'quantity' => $quantity, 'expected_version' => $cart['version']]);
    }

    private function customer(): User
    {
        return User::factory()->create(['password' => self::PASSWORD]);
    }

    private function login(User $u): void
    {
        $this->browser('POST', '/api/v1/auth/login', ['email' => $u->email, 'password' => self::PASSWORD])->assertOk();
    }

    public function test_guest_browse_add_increment_update_remove_clear_and_no_stock_hold(): void
    {
        $v = $this->variant();
        $this->getJson('/api/v1/products')->assertOk()->assertJsonPath('data.0.variants.0.id', $v->id);
        $empty = $this->cartView();
        $this->assertSame(0, $empty['item_count']);
        $this->assertArrayNotHasKey('id', $empty);
        $this->assertArrayNotHasKey('user_id', $empty);
        $added = $this->add($v, 2)->assertOk()->assertJsonPath('data.subtotal_minor', '250100')->json('data');
        $again = $this->add($v, 1)->assertOk()->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.quantity', 3)->json('data');
        $this->browser('PATCH', '/api/v1/cart/items/'.$again['items'][0]['id'], ['quantity' => 4, 'expected_version' => $again['version']])->assertOk()->assertJsonPath('data.subtotal_minor', '500200');
        $current = $this->cartView();
        $this->browser('DELETE', '/api/v1/cart/items/'.$current['items'][0]['id'], ['expected_version' => $current['version']])->assertOk()->assertJsonCount(0, 'data.items');
        $this->add($v)->assertOk();
        $current = $this->cartView();
        $this->browser('DELETE', '/api/v1/cart', ['expected_version' => $current['version']])->assertOk()->assertJsonPath('data.item_count', 0);
        $stock = Inventory::where('variant_id', $v->id)->firstOrFail();
        $this->assertSame(10, $stock->on_hand);
        $this->assertSame(0, $stock->reserved);
        $this->assertSame(0, DB::table('reservations')->count());
        $this->assertSame(1, DB::table('inventory_movements')->count());
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'like', 'cart.%')->count());
    }

    public function test_guest_capability_cookie_idor_and_token_guessing(): void
    {
        $v = $this->variant();
        config(['session.secure' => true]);
        $response = $this->browser('GET', '/api/v1/cart')->assertOk();
        $cookie = collect($response->headers->getCookies())->first(fn ($c) => $c->getName() === 'iranti_cart');
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertTrue($cookie->isSecure());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('', $cookie->getDomain());
        $first = $this->add($v)->assertOk()->json('data');
        $original = $this->jar;
        $digest = Cart::whereNull('user_id')->firstOrFail()->guest_token_hash;
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $digest);
        $this->assertStringNotContainsString($digest, $response->getContent());
        $this->assertNotSame($digest, $original['iranti_cart']);
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie');
        $other = $this->cartView();
        $this->browser('PATCH', '/api/v1/cart/items/'.$first['items'][0]['id'], ['quantity' => 2, 'expected_version' => $other['version']])->assertNotFound();
        $this->browser('DELETE', '/api/v1/cart/items/'.$first['items'][0]['id'], ['expected_version' => $other['version']])->assertNotFound();
        foreach (['guess', str_repeat('a', 64), (string) Cart::first()->id] as $token) {
            $this->jar['iranti_cart'] = $token;
            $this->assertSame(0, $this->cartView()['item_count']);
        }
        $this->jar = $original;
        $this->assertSame(1, $this->cartView()['item_count']);
    }

    public function test_validation_mass_assignment_origin_csrf_and_retry_version(): void
    {
        $v = $this->variant(2);
        $cart = $this->cartView();
        $base = ['variant_id' => $v->id, 'quantity' => 1, 'expected_version' => $cart['version']];
        foreach ([0, -1, 100, '1', 1.0, 1.5, true, null] as $qty) {
            $this->browser('POST', '/api/v1/cart/items', array_replace($base, ['quantity' => $qty]))->assertUnprocessable();
        }
        foreach (['price', 'unit_price_minor', 'line_total', 'subtotal', 'user_id', 'cart_id', 'guest_token_hash'] as $field) {
            $this->browser('POST', '/api/v1/cart/items', $base + [$field => 'forged'])->assertUnprocessable();
        }
        $this->browser('POST', '/api/v1/cart/items', $base, false)->assertStatus(419);
        $this->browser('POST', '/api/v1/cart/items', $base, true, 'https://evil.example')->assertForbidden();
        $this->browser('POST', '/api/v1/cart/items', $base)->assertOk();
        $this->browser('POST', '/api/v1/cart/items', $base)->assertConflict()->assertJsonPath('error.code', 'CART_VERSION_CONFLICT');
        $this->assertSame(1, $this->cartView()['item_count']);
        $this->add($v, 2)->assertConflict()->assertJsonPath('error.code', 'CART_STOCK_CHANGED');
    }

    public function test_account_cart_survives_logout_and_other_devices_and_denies_other_owners(): void
    {
        $a = $this->customer();
        $b = $this->customer();
        $v = $this->variant();
        $this->login($a);
        $first = $this->add($v, 2)->assertOk()->json('data');
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->assertSame(0, $this->cartView()['item_count']);
        $this->login($b);
        $other = $this->cartView();
        $this->browser('PATCH', '/api/v1/cart/items/'.$first['items'][0]['id'], ['quantity' => 1, 'expected_version' => $other['version']])->assertNotFound();
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie');
        $this->login($a);
        $this->assertSame(2, $this->cartView()['item_count']);
        $this->assertSame(1, Cart::where('user_id', $a->id)->where('status', 'active')->count());
        $this->assertSame(2, CartItem::where('id', $first['items'][0]['id'])->value('quantity'));
    }

    public function test_login_merge_combines_duplicates_preserves_unavailable_lines_and_reports_reconciliation(): void
    {
        $u = $this->customer();
        $a = $this->variant(10);
        $b = $this->variant(2);
        $this->login($u);
        $this->add($a, 3)->assertOk();
        $this->browser('POST', '/api/v1/auth/logout');
        $this->add($a, 4)->assertOk();
        $this->add($b)->assertOk();
        $guestJar = $this->jar;
        $stock = Inventory::where('variant_id', $a->id)->firstOrFail();
        app(InventoryService::class)->adjustStock($a->id, -5, 'Stock changed', (string) Str::uuid(), $this->owner, $stock->version);
        $b->update(['status' => 'archived']);
        $a->update(['unit_price_minor' => '200001']);
        $this->login($u);
        $cart = $this->cartView();
        $this->assertSame('MERGED', $cart['merge']['status']);
        $byVariant = array_column($cart['items'], null, 'variant_id');
        $this->assertSame(7, $byVariant[$a->id]['quantity']);
        $this->assertSame(5, $byVariant[$a->id]['suggested_quantity']);
        $this->assertSame('QUANTITY_REVIEW', $byVariant[$a->id]['state']);
        $this->assertSame('200001', $byVariant[$a->id]['unit_price_minor']);
        $this->assertSame('UNAVAILABLE', $byVariant[$b->id]['state']);
        $this->assertSame('0', $cart['subtotal_minor']);
        $this->assertSame(8, $this->cartView()['item_count']); // repeated reads never merge twice
        $this->browser('PATCH', '/api/v1/cart/items/'.$byVariant[$a->id]['id'], ['quantity' => 5, 'expected_version' => $cart['version']])->assertOk()->assertJsonPath('data.subtotal_minor', '1000005');
        $this->assertSame(1, Cart::where('status', 'merged')->count());
        $this->jar = $guestJar;
        $this->assertSame(0, $this->cartView()['item_count']); // retired cookie cannot access merged selections
    }

    public function test_registration_merges_and_limits_preserve_both_carts_until_resolved(): void
    {
        $v = $this->variant(200);
        $this->add($v, 60)->assertOk();
        $this->browser('POST', '/api/v1/auth/register', ['name' => 'New customer', 'email' => 'newcart@example.test', 'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])->assertCreated();
        $this->assertSame(60, $this->cartView()['item_count']);
        $this->browser('POST', '/api/v1/auth/logout');
        $this->add($v, 50)->assertOk();
        $u = User::where('email', 'newcart@example.test')->firstOrFail();
        $this->login($u);
        $blocked = $this->cartView();
        $this->assertSame('REVIEW_REQUIRED', $blocked['merge']['status']);
        $this->assertSame(60, $blocked['item_count']);
        $this->assertSame(50, CartItem::whereIn('cart_id', Cart::whereNull('user_id')->where('status', 'active')->select('id'))->sum('quantity'));
        $this->browser('PATCH', '/api/v1/cart/items/'.$blocked['items'][0]['id'], ['quantity' => 40, 'expected_version' => $blocked['version']])->assertOk();
        $merged = $this->cartView();
        $this->assertSame(90, $merged['item_count']);
        $this->assertSame('MERGED', $merged['merge']['status']);
    }

    public function test_stock_price_and_catalog_changes_are_revalidated_without_deleting_selections(): void
    {
        $v = $this->variant(5);
        $this->add($v, 4)->assertOk();
        $stock = Inventory::where('variant_id', $v->id)->firstOrFail();
        app(InventoryService::class)->adjustStock($v->id, -3, 'Count changed', (string) Str::uuid(), $this->owner, $stock->version);
        $v->update(['unit_price_minor' => '222222']);
        $data = $this->cartView();
        $this->assertSame('QUANTITY_REVIEW', $data['items'][0]['state']);
        $this->assertSame(4, $data['items'][0]['quantity']);
        $this->assertSame('222222', $data['items'][0]['unit_price_minor']);
        $this->assertSame('888888', $data['items'][0]['line_subtotal_minor']);
        $stock->refresh();
        app(InventoryService::class)->adjustStock($v->id, -2, 'No units left', (string) Str::uuid(), $this->owner, $stock->version);
        $this->assertSame('OUT_OF_STOCK', $this->cartView()['items'][0]['state']);
        Product::whereKey($v->product_id)->update(['status' => 'archived']);
        $this->assertSame('UNAVAILABLE', $this->cartView()['items'][0]['state']);
        $this->assertSame(1, CartItem::count());
        $this->add($v)->assertConflict()->assertJsonPath('error.code', 'ITEM_UNAVAILABLE');
    }

    public function test_expiry_rotates_guest_access_and_cleanup_preserves_authenticated_carts(): void
    {
        $v = $this->variant();
        $this->add($v)->assertOk();
        $old = $this->jar['iranti_cart'];
        $guest = Cart::whereNull('user_id')->firstOrFail();
        $guest->forceFill(['expires_at' => now()->subDay()])->save();
        $this->assertSame(0, $this->cartView()['item_count']);
        $this->assertNotSame($old, $this->jar['iranti_cart']);
        $u = $this->customer();
        $this->login($u);
        $this->add($v, 2)->assertOk();
        Cart::where('user_id', $u->id)->update(['expires_at' => now()->subYear()]);
        $this->artisan('cart:purge-guests')->assertSuccessful();
        $this->assertNull($guest->fresh());
        $this->assertSame(2, $this->cartView()['item_count']);
        $this->artisan('cart:purge-guests', ['--limit' => 0])->assertExitCode(2);
    }

    public function test_database_ownership_uniqueness_quantity_and_variant_fk_constraints(): void
    {
        $u = $this->customer();
        $v = $this->variant();
        $this->login($u);
        $this->add($v)->assertOk();
        $cart = (array) DB::table('carts')->where('user_id', $u->id)->first();
        $item = (array) DB::table('cart_items')->first();
        $cases = [
            [fn () => DB::table('carts')->insert(array_replace($cart, ['id' => (string) Str::uuid()])), '23505'],
            [fn () => DB::table('carts')->insert(array_replace($cart, ['id' => (string) Str::uuid(), 'user_id' => null])), '23514'],
            [fn () => DB::table('carts')->insert(array_replace($cart, ['id' => (string) Str::uuid(), 'guest_token_hash' => str_repeat('a', 64)])), '23514'],
            [fn () => DB::table('cart_items')->insert(array_replace($item, ['id' => (string) Str::uuid()])), '23505'],
            [fn () => DB::table('cart_items')->where('id', $item['id'])->update(['quantity' => 0]), '23514'],
            [fn () => DB::table('cart_items')->where('id', $item['id'])->update(['variant_id' => (string) Str::uuid()]), '23503'],
            [fn () => DB::table('product_variants')->where('id', $v->id)->delete(), '23001'],
        ];
        foreach ($cases as [$work,$state]) {
            try {
                DB::transaction($work);
                $this->fail('Constraint must reject invalid cart');
            } catch (QueryException $e) {
                $this->assertSame($state, $e->errorInfo[0]);
            }
        }
    }

    public function test_line_limit_money_overflow_and_bounded_eager_loading(): void
    {
        config(['cart.max_lines' => 1]);
        $a = $this->variant();
        $b = $this->variant();
        $this->add($a)->assertOk();
        $this->add($b)->assertConflict()->assertJsonPath('error.code', 'CART_LINE_LIMIT');
        $a->update(['unit_price_minor' => (string) PHP_INT_MAX]);
        $this->add($a)->assertConflict()->assertJsonPath('error.code', 'CART_TOTAL_LIMIT');
        $this->assertSame((string) PHP_INT_MAX, $this->cartView()['subtotal_minor']);
        $a->update(['unit_price_minor' => '100']);
        $this->add($a)->assertOk();
        $a->update(['unit_price_minor' => (string) PHP_INT_MAX]);
        $view = $this->cartView();
        $this->assertSame('AMOUNT_REVIEW', $view['items'][0]['state']);
        $this->assertNull($view['subtotal_minor']);
        $this->browser('DELETE', '/api/v1/cart/items/'.$view['items'][0]['id'], ['expected_version' => $view['version']])->assertOk();
        config(['cart.max_lines' => 100]);
        $u = $this->customer();
        $service = app(CartService::class);
        for ($i = 0; $i < 5; $i++) {
            $v = $this->variant();
            $current = $service->view($u, null);
            $service->addItem($u, null, $v->id, 1, $current->data['version']);
        }
        DB::enableQueryLog();
        $service->view($u, null);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertLessThanOrEqual(15, count($queries));
    }

    public function test_disabled_identity_and_pending_staff_mfa_cannot_mutate_cart(): void
    {
        $this->login($this->owner);
        $this->browser('GET', '/api/v1/cart')->assertForbidden();
        $this->browser('POST', '/api/v1/auth/logout');
        $u = $this->customer();
        $this->login($u);
        $cart = $this->cartView();
        $u->forceFill(['status' => 'disabled'])->save();
        $this->browser('DELETE', '/api/v1/cart', ['expected_version' => $cart['version']])->assertUnauthorized();
    }

    public function test_concurrent_same_version_addition_accepts_one_without_duplicate_increment(): void
    {
        $this->assertTrue(function_exists('pcntl_fork'));
        $u = $this->customer();
        $v = $this->variant();
        $service = app(CartService::class);
        $version = $service->view($u, null)->data['version'];
        $dir = sys_get_temp_dir().'/iranti-cart-race-'.bin2hex(random_bytes(6));
        mkdir($dir, 0700);
        DB::disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid < 0) {
                    $this->fail('Cannot fork');
                }
                if ($pid === 0) {
                    try {
                        DB::statement("SET statement_timeout='8s'");
                        touch($dir.'/ready-'.$i);
                        $deadline = microtime(true) + 10;
                        while (! file_exists($dir.'/go') && microtime(true) < $deadline) {
                            usleep(1000);
                        }
                        if (! file_exists($dir.'/go')) {
                            throw new \RuntimeException('No barrier');
                        }
                        try {
                            $service->addItem($u, null, $v->id, 1, $version);
                            $result = 'accepted';
                        } catch (CartConflict $e) {
                            $result = $e->cartCode;
                        }
                        file_put_contents($dir.'/result-'.$i, $result);
                        DB::disconnect();
                        exit(0);
                    } catch (\Throwable $e) {
                        file_put_contents($dir.'/result-'.$i, $e::class);
                        DB::disconnect();
                        exit(1);
                    }
                }
                $children[$i] = $pid;
            }
            $deadline = microtime(true) + 12;
            while ((! file_exists($dir.'/ready-0') || ! file_exists($dir.'/ready-1')) && microtime(true) < $deadline) {
                usleep(1000);
            }
            $this->assertFileExists($dir.'/ready-0');
            $this->assertFileExists($dir.'/ready-1');
            touch($dir.'/go');
            foreach ($children as $i => $pid) {
                while (pcntl_waitpid($pid, $status, WNOHANG) === 0) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('Worker timeout');
                    } usleep(1000);
                }
                unset($children[$i]);
                $this->assertSame(0, pcntl_wexitstatus($status), (string) file_get_contents($dir.'/result-'.$i));
            }
            $results = [file_get_contents($dir.'/result-0'), file_get_contents($dir.'/result-1')];
            sort($results);
            $this->assertSame(['CART_VERSION_CONFLICT', 'accepted'], $results);
            $this->assertSame(1, $service->view($u, null)->data['item_count']);
            $this->assertSame(1, CartItem::count());
        } finally {
            foreach ($children as $pid) {
                posix_kill($pid, SIGKILL);
                pcntl_waitpid($pid, $status);
            }
            foreach (glob($dir.'/*') as $file) {
                unlink($file);
            } rmdir($dir);
        }
    }
}
