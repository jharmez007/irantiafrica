<?php

namespace Tests\Infrastructure;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Fulfilment\FulfilmentService;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use App\Orders\OrderService;
use App\Payments\PaymentService;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class FulfilmentTest extends TestCase
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
        config(['payments.enabled' => true, 'payments.mode' => 'test', 'payments.secret_key' => 'sk_test_00000000000000000000000000000000', 'payments.return_origin' => 'http://localhost:3000']);
        config(['shipping.tracking_hosts' => ['tracking.example.test']]);
        Http::preventStrayRequests();
        (new \ReflectionProperty(RateLimiter::class, 'cache'))->setValue(app(RateLimiter::class), Cache::store('array'));
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

    private function provider(string $state = 'success', array $override = []): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function ($r) use ($state, $override) {
            if (str_ends_with($r->url(), '/initialize')) {
                return Http::response(['status' => true, 'data' => ['reference' => $r['reference'], 'authorization_url' => 'https://checkout.paystack.com/fixture-token']]);
            }
            $ref = basename($r->url());
            $a = DB::table('payment_attempts')->where('reference', $ref)->firstOrFail();

            return Http::response(['status' => true, 'data' => array_replace(['id' => '18446744073709551615', 'reference' => $ref, 'amount' => (int) $a->expected_amount_minor, 'currency' => 'NGN', 'domain' => 'test', 'channel' => $a->method, 'status' => $state], $override)]);
        });
    }

    private function init(array $o, string $method = 'card'): TestResponse
    {
        return $this->browser('POST', '/api/v1/orders/'.$o['id'].'/payment-attempts', ['method' => $method]);
    }

    private function verifyApi(array $o, array $a): TestResponse
    {
        return $this->browser('POST', '/api/v1/orders/'.$o['id'].'/payment-attempts/'.$a['id'].'/verify');
    }

    private function paid(?User $user = null): Order
    {
        $this->provider('success', ['id' => (string) random_int(100000000, 999999999)]);
        $o = $this->place($this->prepared($user))->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->verifyApi($o, $a)->assertOk();

        return Order::findOrFail($o['id']);
    }

    private function fields(Order $o): array
    {
        return ['expected_version' => $o->version, 'provider_label' => 'Neutral test carrier', 'tracking_number' => 'REFERENCE / 123-A', 'tracking_url' => 'https://tracking.example.test/parcel?id=123', 'operational_notes' => 'Private packing instruction'];
    }

    private function action(Order $o, string $action, array $extra = [], ?User $actor = null): Order
    {
        return app(FulfilmentService::class)->act($o->id, $actor ?? $this->owner, $action, ['expected_version' => $o->version] + $extra);
    }

    private function ready(): Order
    {
        $o = $this->action($this->paid(), 'processing');

        return $this->action($o, 'create', $this->fields($o));
    }

    public function test_lifecycle_snapshot_stock_and_replay_integrity(): void
    {
        $o = $this->paid();
        $original = $o->getAttributes();
        $movements = DB::table('inventory_movements')->count();
        $balance = DB::table('inventory')->first();
        $o = $this->action($o, 'processing', ['note' => 'Begin packing']);
        $this->assertNotNull($o->processing_at);
        $o = $this->action($o, 'create', $this->fields($o));
        $this->assertNull(app(FulfilmentService::class)->projection($o));
        $o = $this->action($o, 'ship');
        $o = $this->action($o, 'deliver', ['note' => 'Carrier receipt confirmed by staff']);
        $counts = [DB::table('fulfilment_events')->count(), DB::table('audit_logs')->count(), DB::table('order_status_history')->count(), DB::table('shipment_status_history')->count()];
        foreach (['processing', 'ship', 'deliver'] as $action) {
            $this->action($o, $action, ['note' => 'Replay']);
        }
        $this->assertSame($counts, [DB::table('fulfilment_events')->count(), DB::table('audit_logs')->count(), DB::table('order_status_history')->count(), DB::table('shipment_status_history')->count()]);
        $this->assertSame([4, 5, 3], [$counts[0], $counts[2], $counts[3]]);
        $this->assertSame($movements, DB::table('inventory_movements')->count());
        $this->assertEquals($balance, DB::table('inventory')->first());
        foreach (['total_minor', 'delivery_minor', 'tax_minor', 'calculation', 'paid_at', 'current_reservation_id'] as $field) {
            $this->assertSame($original[$field], $o->getAttributes()[$field]);
        }
        $visible = app(OrderService::class)->projection($o);
        $this->assertSame('DELIVERED', $visible['shipment']['status']);
        $this->assertArrayNotHasKey('operational_notes', $visible['shipment']);
        $this->assertArrayNotHasKey('delivery_evidence', $visible['shipment']);
    }

    public function test_http_staff_mfa_rbac_csrf_validation_and_actions(): void
    {
        $o = $this->paid();
        $root = '/api/v1/admin/orders/'.$o->id;
        $this->browser('POST', $root.'/processing', ['expected_version' => $o->version])->assertUnauthorized();
        $staff = $this->staff('order_processing');
        $this->login($staff);
        $this->browser('POST', $root.'/processing', ['expected_version' => $o->version])->assertForbidden();
        $this->mfa();
        $this->browser('POST', $root.'/processing', ['expected_version' => $o->version], false)->assertStatus(419);
        $this->browser('POST', $root.'/processing', ['expected_version' => $o->version, 'status' => 'DELIVERED'])->assertUnprocessable();
        $this->browser('POST', $root.'/processing', ['expected_version' => $o->version])->assertOk()->assertJsonPath('data.fulfilment.actions.save', true);
        $o->refresh();
        foreach (['javascript:alert(1)', 'http://tracking.example.test/a', 'https://evil.test/a', 'https://tracking.example.test.evil.test/a', 'https://user:pass@tracking.example.test/a', 'https://tracking.example.test:443/a'] as $url) {
            $this->browser('POST', $root.'/shipment', array_replace($this->fields($o), ['tracking_url' => $url]))->assertUnprocessable();
        }
        $this->browser('POST', $root.'/shipment', $this->fields($o) + ['order_id' => (string) Str::uuid()])->assertUnprocessable();
        $this->browser('POST', $root.'/shipment', $this->fields($o))->assertOk()->assertJsonPath('data.fulfilment.actions.ship', true);
        $this->browser('GET', $root.'/shipment')->assertOk()->assertJsonPath('data.shipment.operational_notes', 'Private packing instruction');
        $this->browser('POST', $root.'/ship', ['expected_version' => $o->refresh()->version])->assertOk()->assertJsonPath('data.status', 'SHIPPED');
        $this->browser('POST', $root.'/deliver', ['expected_version' => $o->refresh()->version])->assertUnprocessable();
        $this->browser('POST', $root.'/deliver', ['expected_version' => $o->version, 'note' => 'Carrier confirmed receipt'])->assertOk()->assertJsonPath('data.fulfilment.actions.deliver', false);
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $inventory = $this->staff('inventory_store');
        $this->login($inventory);
        $this->mfa();
        foreach (['processing', 'ship', 'deliver', 'shipment'] as $endpoint) {
            $this->browser('POST', $root.'/'.$endpoint, ['expected_version' => $o->version])->assertForbidden();
        }
        $this->browser('GET', $root.'/shipment')->assertForbidden();
    }

    public function test_customer_guest_scope_and_safe_projection(): void
    {
        $o = $this->action($this->ready(), 'ship');
        $path = '/api/v1/orders/'.$o->id;
        $this->browser('GET', $path)->assertOk()->assertJsonPath('data.shipment.status', 'SHIPPED')->assertJsonMissingPath('data.shipment.operational_notes')->assertJsonMissingPath('data.fulfilment');
        $grant = $this->jar;
        $this->jar = [];
        $this->browser('GET', $path)->assertNotFound();
        $this->jar = $grant;
        $this->browser('GET', '/api/v1/orders/'.$o->public_reference)->assertNotFound();
        $account = $this->paid($this->customer());
        $account = $this->action($account, 'processing');
        $account = $this->action($account, 'create', $this->fields($account));
        $account = $this->action($account, 'ship');
        $this->browser('GET', '/api/v1/orders/'.$account->id)->assertOk();
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($this->customer());
        $this->browser('GET', '/api/v1/orders/'.$account->id)->assertNotFound();
        $this->browser('GET', '/api/v1/admin/orders/'.$account->id.'/shipment')->assertForbidden();
    }

    public function test_invalid_states_missing_tracking_stale_versions_and_no_paid_cancellation(): void
    {
        $o = Order::findOrFail($this->place($this->prepared())->assertCreated()->json('data.id'));
        foreach (['processing', 'create', 'ship', 'deliver'] as $action) {
            try {
                $this->action($o, $action, $this->fields($o) + ['note' => 'Receipt']);
                $this->fail('Invalid state accepted');
            } catch (CheckoutConflict $e) {
                $this->assertSame('FULFILMENT_CONFLICT', $e->checkoutCode);
            }
        }
        $this->provider();
        $a = $this->init(['id' => $o->id])->assertCreated()->json('data');
        $this->verifyApi(['id' => $o->id], $a)->assertOk();
        $o->refresh();
        $o = $this->action($o, 'processing');
        $o = $this->action($o, 'create', array_replace($this->fields($o), ['tracking_number' => null, 'tracking_url' => null]));
        try {
            $this->action($o, 'ship');
            $this->fail('Missing tracking accepted');
        } catch (CheckoutConflict) {
            $this->assertSame('PROCESSING', $o->refresh()->status);
        }
        try {
            app(FulfilmentService::class)->act($o->id, $this->owner, 'update', array_replace($this->fields($o), ['expected_version' => 1]));
            $this->fail('Stale edit accepted');
        } catch (CheckoutConflict) {
            $this->assertSame(1, DB::table('shipments')->count());
        }
        try {
            app(OrderService::class)->cancelUnpaid($o->id, $this->owner, null, $o->version, 'Invalid paid cancellation', true);
            $this->fail('Paid cancelled');
        } catch (CheckoutConflict $e) {
            $this->assertSame('ORDER_CANCELLATION_INELIGIBLE', $e->checkoutCode);
        }
    }

    public function test_financial_review_preserves_paid_time_blocks_dispatch_but_not_delivery_fact(): void
    {
        $o = $this->ready();
        $paidAt = $o->paid_at;
        DB::transaction(function () use ($o): void {
            $locked = Order::whereKey($o->id)->lockForUpdate()->firstOrFail();
            app(OrderService::class)->paymentUpdate($locked, 'REQUIRES_REVIEW', null, true);
        });
        try {
            $this->action($o->refresh(), 'ship');
            $this->fail('Hold dispatched');
        } catch (CheckoutConflict) {
            $this->assertTrue($paidAt->eq($o->refresh()->paid_at));
        }
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie');
        $other = $this->action($this->ready(), 'ship');
        DB::transaction(function () use ($other): void {
            $locked = Order::whereKey($other->id)->lockForUpdate()->firstOrFail();
            app(OrderService::class)->paymentUpdate($locked, 'REQUIRES_REVIEW', null, true);
        });
        $other = $this->action($other->refresh(), 'deliver', ['note' => 'Carrier confirmed despite financial review']);
        $this->assertSame('DELIVERED', $other->status);
        $this->assertTrue($other->financial_hold);
        $this->assertNotNull($other->paid_at);
    }

    public function test_database_constraints_history_immutability_and_populated_rollback_guard(): void
    {
        $o = $this->ready();
        $s = DB::table('shipments')->first();
        $operations = [fn () => DB::table('shipments')->insert(array_replace((array) $s, ['id' => (string) Str::uuid()])), fn () => DB::table('shipment_status_history')->update(['note' => 'tamper']), fn () => DB::table('fulfilment_events')->delete(), fn () => DB::table('shipments')->where('id', $s->id)->update(['status' => 'DELIVERED', 'delivered_at' => now(), 'delivery_evidence' => 'Fake']), fn () => DB::table('orders')->where('id', $o->id)->update(['status' => 'SHIPPED', 'version' => $o->version + 1]), fn () => DB::table('shipments')->delete()];
        foreach ($operations as $operation) {
            try {
                DB::transaction($operation);
                $this->fail('Integrity violation accepted');
            } catch (\PDOException) {
                $this->assertTrue(true);
            }
        }
        $migration = require database_path('migrations/2026_09_24_000012_create_fulfilment.php');
        try {
            $migration->down();
            $this->fail('Populated rollback accepted');
        } catch (\PDOException) {
            $this->assertSame(1, DB::table('shipments')->count());
        }
    }

    public function test_postgres_simultaneous_processing(): void
    {
        $o = $this->paid();
        $actors = [$this->owner, $this->staff('order_processing')];
        $results = $this->race(fn ($i) => $this->action($o, 'processing', [], $actors[$i])->status);
        $this->assertSame(['PROCESSING', 'PROCESSING'], $results);
        $this->assertSame(1, DB::table('fulfilment_events')->where('event', 'OrderProcessingStarted')->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'fulfilment.processing')->count());
    }

    public function test_postgres_simultaneous_dispatch(): void
    {
        $o = $this->ready();
        $actors = [$this->owner, $this->staff('order_processing')];
        $results = $this->race(fn ($i) => $this->action($o, 'ship', [], $actors[$i])->status);
        $this->assertSame(['SHIPPED', 'SHIPPED'], $results);
        $this->assertSame(1, DB::table('shipment_status_history')->where('event', 'OrderShipped')->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'fulfilment.ship')->count());
    }

    public function test_postgres_simultaneous_delivery(): void
    {
        $o = $this->action($this->ready(), 'ship');
        $actors = [$this->owner, $this->staff('order_processing')];
        $results = $this->race(fn ($i) => $this->action($o, 'deliver', ['note' => 'Staff confirmed receipt'], $actors[$i])->status);
        $this->assertSame(['DELIVERED', 'DELIVERED'], $results);
        $this->assertSame(1, DB::table('shipment_status_history')->where('event', 'OrderDelivered')->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'fulfilment.deliver')->count());
    }

    public function test_postgres_dispatch_racing_invalid_cancellation(): void
    {
        $o = $this->ready();
        $staff = $this->staff('order_processing');
        $movements = DB::table('inventory_movements')->count();
        $results = $this->race(fn ($i) => $i === 0 ? $this->action($o, 'ship', [], $staff)->status : app(OrderService::class)->cancelUnpaid($o->id, $this->owner, null, $o->version, 'Attempt', true)->status);
        $this->assertSame(['SHIPPED', 'ORDER_CANCELLATION_INELIGIBLE'], $results);
        $this->assertSame('SHIPPED', $o->refresh()->status);
        $this->assertSame($movements, DB::table('inventory_movements')->count());
    }

    public function test_postgres_update_racing_dispatch_requires_fresh_review(): void
    {
        $o = $this->ready();
        $actors = [$this->owner, $this->staff('order_processing')];
        $results = $this->race(fn ($i) => $this->action($o, $i === 0 ? 'update' : 'ship', $i === 0 ? array_replace($this->fields($o), ['tracking_number' => 'CORRECTED']) : [], $actors[$i])->status);
        $this->assertContains('FULFILMENT_CONFLICT', $results);
        $o->refresh();
        $s = DB::table('shipments')->first();
        if ($o->status === 'SHIPPED') {
            $this->assertSame('REFERENCE / 123-A', $s->tracking_number);
            $this->assertSame(['FULFILMENT_CONFLICT', 'SHIPPED'], $results);
        } else {
            $this->assertSame('CORRECTED', $s->tracking_number);
            $this->assertSame(['PROCESSING', 'FULFILMENT_CONFLICT'], $results);
        }
        $this->assertSame($o->status === 'SHIPPED' ? 1 : 0, DB::table('fulfilment_events')->where('event', 'OrderShipped')->count());
    }

    public function test_late_extra_verified_receipt_preserves_each_fulfilment_milestone(): void
    {
        foreach (['PROCESSING', 'SHIPPED', 'DELIVERED'] as $index => $stage) {
            $this->jar = [];
            $this->browser('GET', '/sanctum/csrf-cookie');
            $this->provider('failed');
            $data = $this->place($this->prepared())->assertCreated()->json('data');
            $a = $this->init($data)->assertCreated()->json('data');
            $this->verifyApi($data, $a)->assertOk();
            $b = $this->init($data)->assertCreated()->json('data');
            $this->provider('success', ['id' => (string) (300 + $index * 2)]);
            app(PaymentService::class)->verify($a['id'], 'webhook');
            $o = $this->action(Order::findOrFail($data['id']), 'processing');
            $o = $this->action($o, 'create', $this->fields($o));
            if ($stage !== 'PROCESSING') {
                $o = $this->action($o, 'ship');
            }
            if ($stage === 'DELIVERED') {
                $o = $this->action($o, 'deliver', ['note' => 'Carrier receipt confirmed']);
            }
            $paidAt = $o->paid_at;
            $movements = DB::table('inventory_movements')->count();
            $events = DB::table('fulfilment_events')->count();
            $this->provider('success', ['id' => (string) (301 + $index * 2)]);
            app(PaymentService::class)->verify($b['id'], 'webhook');
            $o->refresh();
            $this->assertSame($stage, $o->status);
            $this->assertTrue($o->financial_hold);
            $this->assertTrue($paidAt->eq($o->paid_at));
            $this->assertSame('REQUIRES_REVIEW', $o->payment_state);
            $this->assertSame(2, DB::table('payments')->where('order_id', $o->id)->count());
            $this->assertSame(1, DB::table('payments')->where('order_id', $o->id)->whereNotNull('applied_at')->count());
            $this->assertSame($movements, DB::table('inventory_movements')->count());
            $this->assertSame($events, DB::table('fulfilment_events')->count());
        }
    }
}
