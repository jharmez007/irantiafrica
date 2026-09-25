<?php

namespace Tests\Infrastructure;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Checkout\CheckoutService;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Models\Cart;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Reservation;
use App\Models\Role;
use App\Models\User;
use App\Orders\OrderService;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class OrderTest extends TestCase
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

    private function prepared(?User $user = null): array
    {
        if ($user) {
            $this->login($user);
        }
        app(CheckoutConfiguration::class)->publish($this->configuration(), $this->owner);
        $v = $this->variant(10, '335');
        $this->add($v, 3)->assertOk();

        return $this->reserve($this->quoted($this->addressed($this->start())))->assertOk()->json('data');
    }

    private function payload(array $s): array
    {
        return ['checkout_id' => $s['id'], 'expected_version' => $s['version'], 'fingerprint' => $s['fingerprint']];
    }

    private function place(array $s): TestResponse
    {
        return $this->browser('POST', '/api/v1/orders', $this->payload($s));
    }

    public function test_guest_promotion_replay_scope_cookie_history_totals_and_no_second_hold(): void
    {
        $s = $this->prepared();
        $before = Reservation::firstOrFail();
        $cart = Cart::firstOrFail();
        $this->operationKey = (string) Str::uuid();
        $response = $this->place($s)->assertCreated();
        $o = $response->json('data');
        $this->assertMatchesRegularExpression('/^IRA-[0-9A-F]{20}$/', $o['number']);
        $this->assertSame('PENDING_PAYMENT', $o['status']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/', $o['history'][0]['at']);
        $this->assertSame('NOT_STARTED', $o['payment']['state']);
        $this->assertSame('1662', $o['total_minor']);
        $this->assertSame('152', $o['tax_minor']);
        $this->assertSame('101', $o['lines'][0]['tax_minor']);
        $this->assertSame($o['id'], $this->place($s)->assertCreated()->json('data.id'));
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('reservations', 1);
        $this->assertDatabaseCount('order_status_history', 1);
        $this->assertSame($before->id, Order::firstOrFail()->current_reservation_id);
        $this->assertTrue($before->expires_at->equalTo(Reservation::firstOrFail()->expires_at));
        $this->assertSame(3, Inventory::sum('reserved'));
        $this->assertSame(10, Inventory::sum('on_hand'));
        $this->assertSame($cart->version, $cart->fresh()->version);
        $this->assertSame('active', $cart->fresh()->status);
        $this->assertDatabaseCount('cart_items', 1);
        $cookieName = 'iranti_order_'.str_replace('-', '', $o['id']);
        $cookie = collect($response->headers->getCookies())->first(fn ($c) => $c->getName() === $cookieName);
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('/api/v1/orders/'.$o['id'], $cookie->getPath());
        $this->assertNotSame($this->jar[$cookieName], Order::firstOrFail()->guest_token_hash);
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertOk()->assertJsonMissingPath('data.guest_token_hash')->assertJsonMissingPath('data.inventory_reference_id')->assertJsonMissingPath('data.history.0.actor_user_id');
        $this->browser('GET', '/api/v1/orders')->assertUnauthorized();
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'])->assertConflict()->assertJsonPath('error.code', 'CHECKOUT_PROMOTED');
        $this->assertSame(3, Inventory::sum('reserved'));
    }

    public function test_account_history_survives_snapshot_source_changes_and_foreign_user_is_denied(): void
    {
        $u = $this->customer();
        $s = $this->prepared($u);
        $o = $this->place($s)->assertCreated()->json('data');
        $v = ProductVariant::firstOrFail();
        $v->forceFill(['unit_price_minor' => '9000', 'price_version' => 2, 'status' => 'archived'])->save();
        DB::table('products')->where('id', $v->product_id)->update(['name' => 'Changed title', 'content_version' => 2]);
        app(CheckoutConfiguration::class)->publish($this->configuration(false), $this->owner);
        DB::table('checkout_addresses')->where('checkout_id', $s['id'])->update(['email' => 'changed@example.test']);
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertOk()->assertJsonPath('data.total_minor', '1662')->assertJsonPath('data.contact.email', 'checkout@example.test')->assertJsonPath('data.lines.0.snapshot.name', $o['lines'][0]['snapshot']['name']);
        $this->browser('GET', '/api/v1/checkout/'.$s['id'])->assertOk()->assertJsonPath('data.order_id', $o['id']);
        $this->assertSame(3, Inventory::sum('reserved'));
        $this->browser('GET', '/api/v1/orders')->assertOk()->assertJsonCount(1, 'data.items');
        $this->login($this->customer());
        $this->browser('GET', '/api/v1/orders')->assertOk()->assertJsonCount(0, 'data.items');
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertNotFound();
        $this->browser('POST', '/api/v1/orders/'.$o['id'].'/cancel', ['expected_version' => 1, 'reason' => 'Not my order'])->assertNotFound();
        $this->place($s)->assertNotFound();
    }

    public function test_guest_capability_not_number_email_or_login_authorizes_and_has_absolute_expiry(): void
    {
        $s = $this->prepared();
        $o = $this->place($s)->assertCreated()->json('data');
        $original = $this->jar;
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertNotFound();
        $this->browser('GET', '/api/v1/orders/'.$o['number'])->assertNotFound();
        $name = 'iranti_order_'.str_replace('-', '', $o['id']);
        $this->jar[$name] = 'guessed';
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertNotFound();
        $u = $this->customer();
        $u->email = 'checkout@example.test';
        $u->save();
        $this->login($u);
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertNotFound();
        $this->jar = $original;
        $expires = Order::firstOrFail()->guest_expires_at;
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertOk();
        $this->assertTrue($expires->equalTo(Order::firstOrFail()->guest_expires_at));
        // Short approved-configurable grant proves DB expiry independent of cookie possession.
        config(['orders.guest_access_seconds' => 1]);
        $this->browser('POST', '/api/v1/orders/'.$o['id'].'/cancel', ['expected_version' => 1, 'reason' => 'Test cancellation'])->assertOk();
        $this->operationKey = null;
        $s = $this->prepared();
        $fresh = $this->place($s)->assertCreated()->json('data');
        sleep(2);
        $this->browser('GET', '/api/v1/orders/'.$fresh['id'])->assertNotFound();
    }

    public function test_unpaid_cancel_is_versioned_idempotent_releases_and_retains_history(): void
    {
        $s = $this->prepared();
        $o = $this->place($s)->assertCreated()->json('data');
        $url = '/api/v1/orders/'.$o['id'].'/cancel';
        $this->browser('POST', $url, ['expected_version' => 2, 'reason' => 'Cancel'])->assertConflict();
        $this->browser('POST', $url, ['expected_version' => 1, 'reason' => 'Cancel', 'status' => 'PAID'])->assertUnprocessable();
        $this->browser('POST', $url, ['expected_version' => 1, 'reason' => 'Cancel'], false)->assertStatus(419);
        $this->browser('POST', $url, ['expected_version' => 1, 'reason' => 'Cancel'], true, 'https://evil.example')->assertForbidden();
        $this->browser('POST', $url, ['expected_version' => 1, 'reason' => 'Customer changed plans'])->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->browser('POST', $url, ['expected_version' => 1, 'reason' => 'Retry'])->assertOk();
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertSame(10, Inventory::sum('on_hand'));
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_items', 1);
        $this->assertDatabaseCount('order_status_history', 2);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'order.cancelled')->count());
        $this->place($s)->assertCreated()->assertJsonPath('data.id', $o['id'])->assertJsonPath('data.status', 'CANCELLED');
        $this->assertDatabaseCount('reservations', 1);
    }

    public function test_expiry_retains_pending_order_and_checkout_cleanup_cannot_release_transferred_hold(): void
    {
        config(['inventory.reservation_ttl_seconds' => 2]);
        $s = $this->prepared();
        $o = $this->place($s)->assertCreated()->json('data');
        $this->assertSame(0, app(CheckoutService::class)->expireDue(500));
        sleep(3);
        $this->assertSame(0, app(CheckoutService::class)->expireDue(500));
        $this->browser('GET', '/api/v1/orders/'.$o['id'])->assertOk()->assertJsonPath('data.status', 'PENDING_PAYMENT')->assertJsonPath('data.reservation.status', 'EXPIRED')->assertJsonPath('data.reservation.eligible', false);
        $this->assertDatabaseCount('order_status_history', 1);
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->place($s)->assertCreated()->assertJsonPath('data.id', $o['id']);
    }

    public function test_stale_unreserved_tampered_and_expired_sources_cannot_create_orders(): void
    {
        $s = $this->prepared();
        foreach (['total_minor' => '1', 'user_id' => (string) Str::uuid(), 'status' => 'PAID', 'payment_state' => 'SUCCEEDED', 'price' => '0', 'tax_minor' => '0', 'delivery_minor' => '0'] as $field => $value) {
            $this->browser('POST', '/api/v1/orders', $this->payload($s) + [$field => $value])->assertUnprocessable();
        }
        $bad = $s;
        $bad['version']++;
        $this->place($bad)->assertConflict();
        $bad = $s;
        $bad['fingerprint'] = str_repeat('0', 64);
        $this->place($bad)->assertConflict();
        $this->browser('DELETE', '/api/v1/checkout/'.$s['id'])->assertOk();
        $this->place($s)->assertConflict();
        $this->assertDatabaseCount('orders', 0);
        $s = $this->prepared();
        $v = ProductVariant::latest()->firstOrFail();
        $v->forceFill(['price_version' => 2, 'unit_price_minor' => '999'])->save();
        $this->place($s)->assertConflict();
        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(0, Inventory::sum('reserved'));
    }

    public function test_database_enforces_immutable_commercial_snapshots_history_and_state(): void
    {
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        foreach (['UPDATE orders SET total_minor=1', 'UPDATE order_items SET snapshot=\'{}\'', 'DELETE FROM order_addresses', 'DELETE FROM order_status_history', "UPDATE orders SET status='PAID'", 'DELETE FROM orders'] as $sql) {
            try {
                DB::statement($sql);
                $this->fail('Immutable order write accepted');
            } catch (QueryException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertSame('1662', Order::firstOrFail()->total_minor);
    }

    private function staff(string $role): User
    {
        $u = $this->customer();
        $u->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['id' => (string) Str::uuid()]);

        return $u;
    }

    private function mfa(): void
    {
        $enrollment = $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertOk()->json('data');
        $totp = new Google2FA;
        $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => $totp->oathTotp($enrollment['secret'], $totp->getTimestamp() - 1)])->assertOk();
    }

    public function test_admin_role_matrix_mfa_operational_reads_and_owner_only_cancellation(): void
    {
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $path = '/api/v1/admin/orders/'.$o['id'];
        $this->login($this->customer());
        $this->browser('GET', $path)->assertForbidden();
        $this->login($this->staff('inventory_store'));
        $this->mfa();
        $this->browser('GET', $path)->assertForbidden();
        $this->browser('GET', '/api/v1/admin/orders')->assertForbidden();
        $this->login($this->staff('order_processing'));
        $this->browser('GET', $path)->assertForbidden();
        $this->mfa();
        $this->browser('GET', $path)->assertOk()->assertJsonPath('data.can_cancel', false);
        $this->browser('GET', '/api/v1/admin/orders')->assertOk()->assertJsonCount(1, 'data.items');
        $this->browser('POST', $path.'/transitions', ['expected_version' => 1, 'reason' => 'Cancel'])->assertForbidden();
        $this->login($this->owner);
        $this->browser('GET', $path)->assertForbidden();
        $this->mfa();
        $this->browser('GET', $path)->assertOk()->assertJsonPath('data.can_cancel', true);
        $this->browser('POST', $path.'/transitions', ['expected_version' => 1, 'reason' => 'Customer requested cancellation'])->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->assertSame('owner', DB::table('order_status_history')->where('event', 'OrderCancelled')->value('source'));
        $this->browser('GET', '/api/v1/admin/orders?status=CANCELLED&from=2026-01-01&to=2026-12-31')->assertOk()->assertJsonCount(1, 'data.items');
        $this->browser('GET', '/api/v1/admin/orders?status=PAID')->assertOk()->assertJsonCount(0, 'data.items');
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

    public function test_concurrent_duplicate_creation_has_one_order_one_event_and_one_hold(): void
    {
        $u = $this->customer();
        $s = $this->prepared($u);
        $data = $this->payload($s);
        $key = (string) Str::uuid();
        $id = $u->id;
        $results = $this->race(fn ($i) => app(OrderService::class)->createFromCheckout(User::findOrFail($id), null, $data, $key)->id);
        $this->assertSame($results[0], $results[1]);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_status_history', 1);
        $this->assertDatabaseCount('reservations', 1);
        $this->assertSame(3, Inventory::sum('reserved'));
    }

    public function test_cancel_racing_duplicate_creation_never_reopens_or_reholds(): void
    {
        $u = $this->customer();
        $s = $this->prepared($u);
        $key = (string) Str::uuid();
        $data = $this->payload($s);
        $service = app(OrderService::class);
        $o = $service->createFromCheckout($u, null, $data, $key);
        $uid = $u->id;
        $oid = $o->id;
        $results = $this->race(fn ($i) => $i === 0 ? app(OrderService::class)->cancelUnpaid($oid, User::findOrFail($uid), null, 1, 'Concurrent cancellation')->status : app(OrderService::class)->createFromCheckout(User::findOrFail($uid), null, $data, $key)->id);
        $this->assertSame('CANCELLED', $results[0]);
        $this->assertSame($oid, $results[1]);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_status_history', 2);
        $this->assertSame(0, Inventory::sum('reserved'));
    }

    public function test_expiry_holding_reference_lock_defeats_late_creation_without_partial_order(): void
    {
        config(['inventory.reservation_ttl_seconds' => 2]);
        $u = $this->customer();
        $s = $this->prepared($u);
        $r = Reservation::firstOrFail();
        $ref = $r->reference_id;
        $rid = $r->id;
        $uid = $u->id;
        $data = $this->payload($s);
        $key = (string) Str::uuid();
        $marker = sys_get_temp_dir().'/order-expiry-lock-'.Str::uuid();
        try {
            $results = $this->race(function ($i) use ($ref, $rid, $uid, $data, $key, $marker) {
                if ($i === 1) {
                    return DB::transaction(function () use ($ref, $rid, $marker) {
                        DB::table('reservation_references')->where('id', $ref)->lockForUpdate()->firstOrFail();
                        file_put_contents($marker, 'locked');
                        sleep(3);

                        return app(InventoryService::class)->expire($rid)->reservation->status;
                    });
                }
                $end = microtime(true) + 5;
                while (! file_exists($marker) && microtime(true) < $end) {
                    usleep(1000);
                }
                if (! file_exists($marker)) {
                    throw new \RuntimeException('Expiry race barrier timed out');
                }

                return app(OrderService::class)->createFromCheckout(User::findOrFail($uid), null, $data, $key)->id;
            });
            $this->assertSame('ORDER_CHECKOUT_INELIGIBLE', $results[0]);
            $this->assertSame('EXPIRED', $results[1]);
            $this->assertDatabaseCount('orders', 0);
            $this->assertDatabaseCount('order_items', 0);
            $this->assertSame(0, Inventory::sum('reserved'));
        } finally {
            if (file_exists($marker)) {
                unlink($marker);
            }
        }
    }

    public function test_inconsistent_line_tax_blocks_promotion_without_partial_order(): void
    {
        $s = $this->prepared();
        DB::table('checkout_lines')->where('checkout_id', $s['id'])->update(['tax_snapshot' => DB::raw("jsonb_set(tax_snapshot, '{tax_minor}', '\"102\"'::jsonb)")]);
        $this->place($s)->assertConflict()->assertJsonPath('error.code', 'ORDER_TOTAL_MISMATCH');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->assertDatabaseCount('order_status_history', 0);
        $this->assertSame(3, Inventory::sum('reserved'));
    }

    public function test_same_user_retry_key_cannot_target_another_checkout_and_database_rejects_duplicate(): void
    {
        $u = $this->customer();
        $s = $this->prepared($u);
        $this->operationKey = (string) Str::uuid();
        $originalKey = $this->operationKey;
        $o = $this->place($s)->assertCreated()->json('data');
        $row = Order::firstOrFail()->getAttributes();
        $row['id'] = (string) Str::uuid();
        $row['public_reference'] = 'IRA-'.strtoupper(bin2hex(random_bytes(10)));
        try {
            DB::table('orders')->insert($row);
            $this->fail('Duplicate checkout accepted');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
        $this->operationKey = null;
        $s2 = $this->reserve($this->quoted($this->addressed($this->start())))->assertOk()->json('data');
        $this->operationKey = $originalKey;
        $this->place($s2)->assertConflict()->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame($o['id'], Order::firstOrFail()->id);
        $this->browser('GET', '/api/v1/orders?to=2026-12-31')->assertOk()->assertJsonCount(1, 'data.items');
    }
}
