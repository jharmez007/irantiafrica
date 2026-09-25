<?php

namespace Tests\Infrastructure;

use App\Cart\CartService;
use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Checkout\CheckoutService;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Models\Cart;
use App\Models\Category;
use App\Models\CheckoutSession;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Reservation;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Illuminate\Validation\ValidationException;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class CheckoutTest extends TestCase
{
    private array $jar = [];

    private ?string $operationKey = null;

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
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => $origin, 'HTTP_REFERER' => $origin.'/', 'CONTENT_TYPE' => 'application/json', 'HTTP_IDEMPOTENCY_KEY' => $this->operationKey ?? (string) Str::uuid()];
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

    private function configuration(bool $taxable = true): array
    {
        return ['version_code' => 'demo-'.Str::uuid(), 'development_only' => true, 'payload' => ['rounding' => 'HALF_UP', 'product_rules' => [['category' => 'test-unconfigured', 'rate' => '0.1', 'label' => 'DEVELOPMENT CONFIGURATION ONLY']], 'delivery_tax' => ['taxable' => $taxable, 'rate' => $taxable ? '0.1' : null, 'label' => 'DEVELOPMENT CONFIGURATION ONLY'], 'zones' => [['code' => 'LAGOS', 'state_code' => 'LAGOS', 'locality_code' => null, 'active' => true, 'amount_minor' => '505', 'provider_label' => 'Development sample', 'service_label' => 'Sample delivery', 'source_reference' => 'DEVELOPMENT CONFIGURATION ONLY']]]];
    }

    private function addressData(): array
    {
        return ['recipient_name' => 'Test recipient', 'phone' => '0801 234 5678', 'line1' => '1 Test Road', 'line2' => null, 'city' => 'Lagos', 'state_code' => 'LAGOS', 'postal_code' => null, 'country_code' => 'NG', 'locality_code' => null];
    }

    private function start(): array
    {
        return $this->browser('POST', '/api/v1/checkout', ['expected_version' => $this->cartView()['version']])->assertOk()->json('data');
    }

    private function addressed(array $s): array
    {
        return $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', ['expected_version' => $s['version'], 'email' => 'checkout@example.test', 'address' => $this->addressData()])->assertOk()->json('data');
    }

    private function quoted(array $s): array
    {
        return $this->browser('POST', '/api/v1/checkout/'.$s['id'].'/validate', ['expected_version' => $s['version']])->assertOk()->json('data');
    }

    private function reserve(array $s): TestResponse
    {
        return $this->browser('POST', '/api/v1/checkout/'.$s['id'].'/reserve', ['expected_version' => $s['version'], 'fingerprint' => $s['fingerprint']]);
    }

    public function test_guest_quote_totals_reserve_retry_cancel_and_unchanged_cart(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $v = $this->variant(10, '335');
        $this->add($v, 3)->assertOk();
        $this->add($this->variant(10, '335'), 3)->assertOk();
        $cart = Cart::firstOrFail();
        $version = $cart->version;
        $this->operationKey = (string) Str::uuid();
        $s = $this->start();
        $this->assertSame($s['id'], $this->start()['id']);
        $this->assertDatabaseCount('checkout_sessions', 1);
        $this->assertDatabaseCount('reservations', 0);
        $s = $this->addressed($s);
        $s = $this->quoted($s);
        $this->assertSame('2010', $s['subtotal_minor']);
        $this->assertSame('253', $s['tax_minor']);
        $this->assertSame('505', $s['delivery_minor']);
        $this->assertSame('2768', $s['total_minor']);
        $this->assertSame('101', $s['lines'][0]['tax']['tax_minor']);
        $this->assertEquals(['base_minor' => '33', 'extra_units' => 2, 'quantity' => 3], $s['lines'][0]['tax']['allocation']);
        $this->assertTrue($s['calculation']['delivery_taxable']);
        $this->assertSame('+2348012345678', $s['contact']['address']['phone']);
        $reserved = $this->reserve($s)->assertOk()->assertJsonPath('data.status', 'RESERVED')->json('data');
        $this->reserve($s)->assertOk()->assertJsonPath('data.expires_at', $reserved['expires_at']);
        $this->assertSame(3, Inventory::where('variant_id', $v->id)->firstOrFail()->reserved);
        $this->assertDatabaseCount('reservations', 1);
        $this->assertSame($version, $cart->fresh()->version);
        $this->assertDatabaseCount('cart_items', 2);
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'])->assertOk();
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertSame(2, DB::table('inventory_movements')->where('kind', 'RELEASE')->count());
    }

    public function test_missing_and_invalid_configuration_and_delivery_fail_closed(): void
    {
        $this->add($this->variant())->assertOk();
        $s = $this->addressed($this->start());
        $this->browser('POST', '/api/v1/checkout/'.$s['id'].'/validate', ['expected_version' => $s['version']])->assertConflict()->assertJsonPath('error.code', 'TAX_CONFIGURATION_REQUIRED');
        foreach (['bad-rate', 'float', 'rounding', 'delivery', 'duplicate'] as $case) {
            $c = $this->configuration();
            if ($case === 'bad-rate') {
                $c['payload']['product_rules'][0]['rate'] = '-0.1';
            }
            if ($case === 'float') {
                $c['payload']['product_rules'][0]['rate'] = 0.1;
            }
            if ($case === 'rounding') {
                $c['payload']['rounding'] = 'HALF_EVEN';
            }
            if ($case === 'delivery') {
                $c['payload']['delivery_tax']['rate'] = null;
            }
            if ($case === 'duplicate') {
                $c['payload']['zones'][] = array_merge($c['payload']['zones'][0], ['code' => 'DUPLICATE']);
            }
            try {
                app(CheckoutConfiguration::class)->publish($c, $this->owner);
                $this->fail('Invalid config accepted');
            } catch (ValidationException) {
                $this->addToAssertionCount(1);
            }
        }
        $c = $this->configuration(false);
        $c['payload']['zones'][0]['active'] = false;
        app(CheckoutConfiguration::class)->publish($c, $this->owner);
        $this->browser('POST', '/api/v1/checkout/'.$s['id'].'/validate', ['expected_version' => $s['version']])->assertConflict()->assertJsonPath('error.code', 'DELIVERY_UNAVAILABLE');
        $this->assertDatabaseCount('reservations', 0);
    }

    public function test_non_taxable_delivery_history_and_configuration_change_release_hold(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(false), $this->owner);
        $this->add($this->variant(5, '1005'))->assertOk();
        $s = $this->quoted($this->addressed($this->start()));
        $this->assertSame('0', $s['calculation']['delivery_tax_minor']);
        $this->assertSame('0', $s['calculation']['delivery_taxable_base_minor']);
        $this->assertSame('1611', $s['total_minor']);
        $r = $this->reserve($s)->assertOk()->json('data');
        $historical = $r['lines'][0]['tax'];
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $read = $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.status', 'REVIEW_REQUIRED')->json('data');
        $this->assertSame($historical, $read['lines'][0]['tax']);
        $this->assertSame('1611', $read['total_minor']);
        $this->assertSame(0, Inventory::sum('reserved'));
    }

    public function test_ownership_token_guessing_input_tampering_mfa_and_saved_addresses(): void
    {
        $this->add($this->variant())->assertOk();
        $s = $this->start();
        $jar = $this->jar;
        $stored = CheckoutSession::findOrFail($s['id']);
        $this->assertNotNull($stored->guest_token_hash);
        $this->assertArrayNotHasKey('guest_token_hash', $s);
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertNotFound();
        $this->jar['iranti_checkout'] = 'guessed';
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertNotFound();
        $this->jar = $jar;
        foreach (['user_id', 'total_minor', 'tax_minor', 'delivery_minor', 'status', 'quantity'] as $field) {
            $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', [$field => '0', 'expected_version' => $s['version'], 'email' => 'test@example.test', 'address' => $this->addressData()])->assertUnprocessable();
        }
        $bad = $this->addressData();
        $bad['state_code'] = 'not-a-state';
        $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', ['expected_version' => $s['version'], 'email' => 'test@example.test', 'address' => $bad])->assertUnprocessable();
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'], [], false)->assertStatus(419);
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'], [], true, 'https://evil.example')->assertForbidden();
        $customer = $this->customer();
        $this->login($customer);
        $address = $this->browser('POST', '/api/v1/addresses', $this->addressData())->assertCreated()->json('data');
        $this->browser('GET', '/api/v1/addresses')->assertOk()->assertJsonCount(1, 'data');
        $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', ['expected_version' => $s['version'], 'email' => $customer->email, 'saved_address_id' => $address['id']])->assertConflict()->assertJsonPath('error.code', 'CHECKOUT_REVIEW_REQUIRED');
        $this->assertNull(CheckoutSession::findOrFail($s['id'])->user_id);
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'])->assertOk();
        $s = $this->start();
        $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', ['expected_version' => $s['version'], 'email' => $customer->email, 'saved_address_id' => $address['id']])->assertOk()->assertJsonPath('data.ownership', 'account');
        $this->browser('DELETE', '/api/v1/addresses/'.$address['id'])->assertOk();
        $this->assertDatabaseCount('checkout_addresses', 1);
        $other = $this->customer();
        $this->login($other);
        $this->jar = array_diff_key($this->jar, ['iranti_checkout' => true]);
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertNotFound();
        $this->login($this->owner);
        $this->browser('POST', '/api/v1/checkout', ['expected_version' => 1])->assertForbidden();
        $this->browser('POST', '/api/v1/admin/checkout-configurations', $this->configuration())->assertForbidden();
    }

    public function test_account_persistence_one_active_attempt_and_stale_cart(): void
    {
        $u = $this->customer();
        $this->login($u);
        $this->add($this->variant())->assertOk();
        $s = $this->start();
        $this->operationKey = (string) Str::uuid();
        $this->browser('POST', '/api/v1/checkout', ['expected_version' => $this->cartView()['version']])->assertConflict()->assertJsonPath('error.code', 'CHECKOUT_ALREADY_ACTIVE');
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertNotFound();
        $this->login($u);
        $this->browser('GET', '/api/v1/checkout/current')->assertOk()->assertJsonPath('data.id', $s['id']);
        $other = $this->customer();
        $this->login($other);
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertNotFound();
        $this->login($u);
        $cart = $this->cartView();
        $this->browser('DELETE', '/api/v1/cart', ['expected_version' => $cart['version']])->assertOk();
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.status', 'REVIEW_REQUIRED');
        $this->startEmpty();
    }

    private function startEmpty(): void
    {
        $this->browser('POST', '/api/v1/checkout', ['expected_version' => $this->cartView()['version']])->assertConflict()->assertJsonPath('error.code', 'CART_REVIEW_REQUIRED');
    }

    public function test_price_change_insufficient_stock_and_expiry(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $v = $this->variant(2, '1005');
        $this->add($v, 2)->assertOk();
        $s = $this->quoted($this->addressed($this->start()));
        $v->forceFill(['unit_price_minor' => '2000', 'price_version' => 2])->save();
        $this->reserve($s)->assertConflict()->assertJsonPath('error.code', 'CHECKOUT_REVIEW_REQUIRED');
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->operationKey = (string) Str::uuid();
        $s = $this->quoted($this->addressed($this->start()));
        $stock = Inventory::where('variant_id', $v->id)->firstOrFail();
        app(InventoryService::class)->adjustStock($v->id, -1, 'Test elsewhere', (string) Str::uuid(), $this->owner, $stock->version);
        $this->reserve($s)->assertConflict();
        $this->assertSame(0, Inventory::sum('reserved'));
        $cart = $this->cartView();
        $this->browser('PATCH', '/api/v1/cart/items/'.$cart['items'][0]['id'], ['quantity' => 1, 'expected_version' => $cart['version']])->assertOk();
        $this->operationKey = (string) Str::uuid();
        config(['inventory.reservation_ttl_seconds' => 1]);
        $s = $this->quoted($this->addressed($this->start()));
        $this->reserve($s)->assertOk();
        DB::select('SELECT pg_sleep(1.1)');
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.status', 'EXPIRED');
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertSame('EXPIRED', Reservation::firstOrFail()->status);
        Artisan::call('checkout:expire');
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->reserve($s)->assertConflict();
    }

    private function prepared(User $u, ProductVariant $v): CheckoutSession
    {
        $c = app(CartService::class);
        $cart = $c->view($u, null);
        $c->addItem($u, null, $v->id, 1, $cart->data['version']);
        $cart = $c->view($u, null);
        $service = app(CheckoutService::class);
        $s = $service->begin($u, null, null, $cart->data['version'], (string) Str::uuid())['checkout'];
        $s = $service->command($s->id, $u, null, 'address', ['expected_version' => $s->version, 'email' => $u->email, 'address' => $this->addressData()]);

        return $service->command($s->id, $u, null, 'validate', ['expected_version' => $s->version]);
    }

    private function race(\Closure $work): array
    {
        $dir = sys_get_temp_dir().'/iranti-checkout-race-'.bin2hex(random_bytes(6));
        mkdir($dir, 0700);
        DB::disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid < 0) {
                    $this->fail('Fork failed');
                }
                if ($pid === 0) {
                    try {
                        DB::statement("SET statement_timeout='10s'");
                        touch($dir.'/ready-'.$i);
                        $end = microtime(true) + 12;
                        while (! file_exists($dir.'/go') && microtime(true) < $end) {
                            usleep(1000);
                        }
                        try {
                            $result = $work($i);
                        } catch (CheckoutConflict $e) {
                            $result = $e->checkoutCode;
                        } catch (InventoryConflict $e) {
                            $result = $e->inventoryCode;
                        }
                        file_put_contents($dir.'/result-'.$i, $result);
                        DB::disconnect();
                        exit(0);
                    } catch (\Throwable $e) {
                        file_put_contents($dir.'/result-'.$i, $e::class.':'.$e->getMessage());
                        exit(1);
                    }
                }
                $children[$i] = $pid;
            }
            $end = microtime(true) + 15;
            while ((! file_exists($dir.'/ready-0') || ! file_exists($dir.'/ready-1')) && microtime(true) < $end) {
                usleep(1000);
            }$this->assertFileExists($dir.'/ready-0');
            $this->assertFileExists($dir.'/ready-1');
            touch($dir.'/go');
            foreach ($children as $i => $pid) {
                while (pcntl_waitpid($pid, $status, WNOHANG) === 0) {
                    if (microtime(true) > $end) {
                        throw new \RuntimeException('Race timeout');
                    }usleep(1000);
                }unset($children[$i]);
                $this->assertSame(0, pcntl_wexitstatus($status), (string) file_get_contents($dir.'/result-'.$i));
            }

            return [file_get_contents($dir.'/result-0'), file_get_contents($dir.'/result-1')];
        } finally {
            foreach ($children as $pid) {
                posix_kill($pid, SIGKILL);
                pcntl_waitpid($pid, $status);
            }foreach (glob($dir.'/*') as $file) {
                unlink($file);
            }rmdir($dir);
        }
    }

    public function test_two_checkouts_competing_for_last_unit(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $v = $this->variant(1);
        $users = [$this->customer(), $this->customer()];
        $sessions = [$this->prepared($users[0], $v), $this->prepared($users[1], $v)];
        $results = $this->race(function (int $i) use ($sessions, $users): string {
            $s = $sessions[$i];

            return app(CheckoutService::class)->command($s->id, $users[$i], null, 'reserve', ['expected_version' => $s->version, 'fingerprint' => $s->fingerprint], (string) Str::uuid())->status;
        });
        $this->assertSame(1, count(array_filter($results, fn ($r) => $r === 'RESERVED')));
        $this->assertSame(1, Inventory::sum('reserved'));
        $this->assertSame(1, Reservation::where('status', 'ACTIVE')->count());
        $this->assertSame(1, DB::table('inventory_movements')->where('kind', 'RESERVE')->count());
    }

    public function test_duplicate_reserve_race_and_cancel_expiry_race(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $u = $this->customer();
        $v = $this->variant(1);
        $s = $this->prepared($u, $v);
        $key = (string) Str::uuid();
        config(['inventory.reservation_ttl_seconds' => 1]);
        $results = $this->race(fn (int $i) => app(CheckoutService::class)->command($s->id, $u, null, 'reserve', ['expected_version' => $s->version, 'fingerprint' => $s->fingerprint], $key)->status);
        $this->assertSame(['RESERVED', 'RESERVED'], $results);
        $this->assertDatabaseCount('reservations', 1);
        DB::select('SELECT pg_sleep(1.1)');
        $reservation = Reservation::firstOrFail();
        $this->race(function (int $i) use ($s, $u, $reservation): string {
            if ($i === 0) {
                return app(CheckoutService::class)->command($s->id, $u, null, 'cancel')->status;
            }

            return app(InventoryService::class)->expire($reservation->id)->reservation->status;
        });
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertSame(1, Inventory::sum('on_hand'));
        $this->assertSame(1, DB::table('inventory_movements')->where('kind', 'RELEASE')->count());
        $this->assertSame('EXPIRED', CheckoutSession::findOrFail($s->id)->status);
    }

    public function test_configuration_publication_serializes_and_is_immutable(): void
    {
        $input = $this->configuration();
        $input['effective_from'] = now()->addMinute()->format('Y-m-d\TH:i:sP');
        $results = $this->race(function (int $i) use ($input): string {
            $input['version_code'] = 'race-'.$i;
            app(CheckoutConfiguration::class)->publish($input, $this->owner);

            return 'PUBLISHED';
        });
        sort($results);
        $this->assertSame(['CONFIGURATION_DATE_CONFLICT', 'PUBLISHED'], $results);
        $this->assertDatabaseCount('checkout_configurations', 1);
        try {
            DB::table('checkout_configurations')->update(['version_code' => 'tampered']);
            $this->fail('Immutable config mutated');
        } catch (QueryException $e) {
            $this->assertSame('P0001', $e->getCode());
        }
    }

    public function test_production_rejects_missing_or_development_tax_configuration(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $this->app['env'] = 'production';
        try {
            try {
                app(CheckoutConfiguration::class)->current();
                $this->fail('Production selected demo configuration');
            } catch (CheckoutConflict $e) {
                $this->assertSame('TAX_CONFIGURATION_REQUIRED', $e->checkoutCode);
            }
            try {
                app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
                $this->fail('Published demo in production');
            } catch (ValidationException) {
                $this->addToAssertionCount(1);
            }
        } finally {
            $this->app['env'] = 'testing';
        }
    }

    public function test_own_reserved_stock_is_not_rejected_and_catalog_archival_releases(): void
    {
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $v = $this->variant(1);
        $this->add($v)->assertOk();
        $s = $this->quoted($this->addressed($this->start()));
        $this->reserve($s)->assertOk();
        $this->assertSame(0, Inventory::firstOrFail()->available());
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.status', 'RESERVED');
        $v->forceFill(['status' => 'archived', 'price_version' => 2])->save();
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.status', 'REVIEW_REQUIRED');
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertSame(1, Inventory::sum('on_hand'));
    }

    public function test_invalid_cart_and_idempotency_input_do_not_create_partial_checkout(): void
    {
        $this->startEmpty();
        $v = $this->variant(1);
        $this->add($v)->assertOk();
        $cart = $this->cartView();
        $v->forceFill(['status' => 'archived'])->save();
        $this->browser('POST', '/api/v1/checkout', ['expected_version' => $cart['version']])->assertConflict()->assertJsonPath('error.code', 'CART_REVIEW_REQUIRED');
        $this->assertDatabaseCount('checkout_sessions', 0);
        $this->assertDatabaseCount('reservations', 0);
        $v->forceFill(['status' => 'active'])->save();
        $this->operationKey = (string) Str::uuid();
        $s = $this->start();
        $this->browser('POST', '/api/v1/checkout', ['expected_version' => $cart['version'] + 1])->assertConflict()->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');
        $this->operationKey = 'malformed';
        $this->browser('POST', '/api/v1/checkout', ['expected_version' => $cart['version']])->assertUnprocessable();
        $this->assertDatabaseCount('checkout_sessions', 1);
        $this->assertSame('DRAFT', CheckoutSession::findOrFail($s['id'])->status);
    }

    public function test_missing_category_and_locality_override_never_assume_zero_or_state_rate(): void
    {
        $c = $this->configuration();
        $c['payload']['product_rules'][0]['category'] = 'other';
        app(CheckoutConfiguration::class)->publish($c, $this->owner);
        $this->add($this->variant())->assertOk();
        $s = $this->addressed($this->start());
        $this->browser('POST', '/api/v1/checkout/'.$s['id'].'/validate', ['expected_version' => $s['version']])->assertConflict()->assertJsonPath('error.code', 'TAX_CONFIGURATION_REQUIRED');
        $c = $this->configuration();
        $c['payload']['zones'][] = array_merge($c['payload']['zones'][0], ['code' => 'ISLAND', 'locality_code' => 'ISLAND', 'active' => false]);
        app(CheckoutConfiguration::class)->publish($c, $this->owner);
        $address = $this->addressData();
        $address['locality_code'] = 'ISLAND';
        $s = $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', ['expected_version' => $s['version'], 'email' => 'test@example.test', 'address' => $address])->assertOk()->json('data');
        $this->browser('POST', '/api/v1/checkout/'.$s['id'].'/validate', ['expected_version' => $s['version']])->assertConflict()->assertJsonPath('error.code', 'DELIVERY_UNAVAILABLE');
        $this->assertDatabaseCount('reservations', 0);
    }

    public function test_configuration_http_publication_requires_owner_mfa(): void
    {
        $u = $this->customer();
        $this->login($u);
        $this->browser('POST', '/api/v1/admin/checkout-configurations', $this->configuration())->assertForbidden();
        $this->login($this->owner);
        $this->browser('POST', '/api/v1/admin/checkout-configurations', $this->configuration())->assertForbidden();
        $enrollment = $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertOk()->json('data');
        $totp = new Google2FA;
        $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => $totp->oathTotp($enrollment['secret'], $totp->getTimestamp() - 1)])->assertOk();
        $this->browser('POST', '/api/v1/admin/checkout-configurations', $this->configuration())->assertCreated();
        $this->assertDatabaseCount('checkout_configurations', 1);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'checkout.configuration_published')->count());
    }

    public function test_saved_address_cross_user_access_and_multi_item_reconciliation(): void
    {
        $u = $this->customer();
        $this->login($u);
        $address = $this->browser('POST', '/api/v1/addresses', $this->addressData())->assertCreated()->json('data');
        $other = $this->customer();
        $this->login($other);
        $this->browser('GET', '/api/v1/addresses')->assertOk()->assertJsonCount(0, 'data');
        $this->browser('DELETE', '/api/v1/addresses/'.$address['id'])->assertNotFound();
        $v = $this->variant(2);
        $w = $this->variant(1);
        $this->add($v)->assertOk();
        $this->add($w)->assertOk();
        $s = $this->start();
        $this->browser('PATCH', '/api/v1/checkout/'.$s['id'].'/address', ['expected_version' => $s['version'], 'email' => $other->email, 'saved_address_id' => $address['id']])->assertNotFound();
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $s = $this->quoted($this->addressed($s));
        $stock = Inventory::where('variant_id', $w->id)->firstOrFail();
        app(InventoryService::class)->adjustStock($w->id, -1, 'Test unavailable line', (string) Str::uuid(), $this->owner, $stock->version);
        $this->reserve($s)->assertConflict();
        $this->assertDatabaseCount('reservations', 0);
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertDatabaseCount('checkout_lines', 2);
        $this->assertDatabaseCount('cart_items', 2);
    }
}
