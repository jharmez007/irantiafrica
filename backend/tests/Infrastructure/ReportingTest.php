<?php

namespace Tests\Infrastructure;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Communications\NotificationDelivery;
use App\Fulfilment\FulfilmentService;
use App\Identity\PermissionMatrix;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use App\Payments\RefundVerification;
use App\Reporting\OperationsReport;
use App\Reporting\ReportWindow;
use App\Reporting\SalesReport;
use App\Reporting\StockReport;
use App\Returns\RefundService;
use App\Returns\ReturnPolicy;
use App\Returns\ReturnService;
use Carbon\CarbonImmutable;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Client\Factory;
use Illuminate\Queue\QueueManager;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class ReportingTest extends TestCase
{
    private array $jar = [];

    private ?string $operationKey = null;

    private User $owner;

    private QueueManager $realQueue;

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
        $this->realQueue = Queue::getFacadeRoot();
        Queue::fake();
        Mail::purge('array');
        config(['communications.enabled' => true, 'communications.frontend_origin' => 'http://localhost:3000']);
        config(['payments.enabled' => true, 'payments.mode' => 'test', 'payments.secret_key' => 'sk_test_00000000000000000000000000000000', 'payments.return_origin' => 'http://localhost:3000']);
        config(['refunds.enabled' => true]);
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

    private function delivered(?User $user = null): Order
    {
        app(ReturnPolicy::class)->publish(['version_code' => 'test-'.Str::uuid(), 'development_only' => true, 'approval_reference' => 'Synthetic fixture only', 'policy' => ['anchor' => 'DELIVERED_AT', 'timezone' => 'Africa/Lagos', 'cutoff' => 'LOCAL_DAY_END', 'eligible_states' => ['DELIVERED'], 'delivery_refunds' => false, 'partial_returns' => true, 'physical_receipt_required' => true, 'reasons' => ReturnPolicy::REASONS]], $this->owner);
        $o = $this->action($this->paid($user), 'processing');
        $o = $this->action($o, 'create', $this->fields($o));

        return $this->action($this->action($o, 'ship'), 'deliver', ['note' => 'Fixture delivery receipt']);
    }

    private function requestReturn(Order $o, int $qty = 1): \stdClass
    {
        $line = DB::table('order_items')->where('order_id', $o->id)->firstOrFail();
        $response = $this->browser('POST', '/api/v1/orders/'.$o->id.'/returns', ['reason_code' => 'DAMAGED_PRODUCT', 'explanation' => 'Test damage', 'items' => [['order_item_id' => $line->id, 'quantity' => $qty]]])->assertCreated();

        return DB::table('return_requests')->where('id', $response->json('data.id'))->firstOrFail();
    }

    private function returnAction(\stdClass $r, string $action, array $extra = []): \stdClass
    {
        return app(ReturnService::class)->act($r->id, $this->owner, $action, ['expected_version' => $r->version, 'note' => 'Recorded fixture decision'] + $extra);
    }

    private function approved(\stdClass $r): \stdClass
    {
        return $this->returnAction($r, 'approve', ['items' => DB::table('return_items')->where('return_request_id', $r->id)->get()->map(fn ($i) => ['return_item_id' => $i->id, 'quantity' => $i->quantity])->all()]);
    }

    private function received(\stdClass $r): \stdClass
    {
        return $this->returnAction($this->approved($r), 'receive');
    }

    private function inspected(\stdClass $r, string $disposition = 'SALEABLE'): \stdClass
    {
        return $this->returnAction($r, 'inspect', ['items' => DB::table('return_items')->where('return_request_id', $r->id)->get()->map(fn ($i) => ['return_item_id' => $i->id, 'disposition' => $disposition])->all()]);
    }

    private function refund(\stdClass $r): \stdClass
    {
        return app(RefundService::class)->approve($r->id, $this->owner, $r->version, 'Approved historical amount');
    }

    private function observation(\stdClass $r, string $id = '123456789'): RefundVerification
    {
        return new RefundVerification('SUCCEEDED', $id, DB::table('payments')->where('id', $r->payment_id)->value('provider_transaction_id'), (string) $r->amount_minor, 'NGN', $r->merchant_reference, 'test');
    }

    private function pending(\stdClass $r): string
    {
        $token = (string) Str::uuid();
        DB::table('refunds')->where('id', $r->id)->update(['status' => 'SUBMITTING', 'lease_token' => $token]);

        return $token;
    }

    private function report(string $route = 'dashboard', string $query = ''): TestResponse
    {
        return $this->browser('GET', '/api/v1/admin/'.($route === 'dashboard' ? $route : 'reports/'.$route).$query);
    }

    public function test_owner_dashboard_reconciles_paid_refund_and_historical_product_facts(): void
    {
        $o = $this->delivered();
        $r = $this->received($this->requestReturn($o));
        $f = $this->refund($r);
        app(RefundService::class)->finalize($f->id, $this->pending($f), $this->observation($f), 'test');
        $line = DB::table('order_items')->where('order_id', $o->id)->first();
        $v = ProductVariant::findOrFail($line->variant_id);
        Product::findOrFail($v->product_id)->update(['name' => 'Changed live name']);
        // An extra verified receipt is deliberately not applied to a second sale.
        $receipt = (array) DB::table('payments')->where('order_id', $o->id)->first();
        $receipt['id'] = (string) Str::uuid();
        $receipt['provider_transaction_id'] = 'extra-'.Str::uuid();
        $receipt['provider_reference'] = 'extra-'.Str::uuid();
        $receipt['applied_at'] = null;
        $receipt['exception_code'] = 'EXTRA_PAYMENT';
        DB::table('payments')->insert($receipt);
        DB::table('orders')->where('id', $o->id)->update(['financial_hold' => true, 'version' => $o->version + 1]);
        $unpaid = $this->place($this->prepared())->assertCreated()->json('data');
        $this->provider('failed');
        $attempt = $this->init($unpaid)->assertCreated()->json('data');
        $this->verifyApi($unpaid, $attempt)->assertOk();
        $cancelled = $this->place($this->prepared())->assertCreated()->json('data');
        $this->browser('POST', '/api/v1/orders/'.$cancelled['id'].'/cancel', ['expected_version' => 1, 'reason' => 'Fixture cancellation'])->assertOk();
        $this->login($this->owner);
        $this->mfa();
        $data = $this->report()->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data');
        $this->assertSame('1662', $data['sales']['values']['gross_minor']);
        $this->assertSame('369', $data['sales']['values']['refunded_minor']);
        $this->assertSame('1293', $data['sales']['values']['net_minor']);
        $this->assertSame('1662', $data['sales']['values']['held_minor']);
        $this->assertSame(1, $data['sales']['unapplied_receipts']);
        $this->assertSame(1, $data['orders']['counts']['DELIVERED']);
        $this->assertSame(1, $data['orders']['counts']['PENDING_PAYMENT']);
        $this->assertSame(1, $data['orders']['counts']['CANCELLED']);
        $this->assertSame(1, collect($data['payments']['counts'])->firstWhere('status', 'FAILED')['count']);
        $this->assertSame('3', $data['products']['items'][0]['units']);
        $this->assertSame('1005', $data['products']['items'][0]['gross_minor']);
        $this->assertSame('335', $data['products']['items'][0]['refunded_base_minor']);
        $this->assertSame(json_decode($line->snapshot, true)['name'], $data['products']['items'][0]['name']);
        $this->assertStringNotContainsString($o->contact_email, json_encode($data));
        $this->assertStringNotContainsString('provider_transaction_id', json_encode($data));
        $this->assertSame('Africa/Lagos', $data['range']['timezone']);
        $this->assertSame(1, collect($data['returns']['counts'])->firstWhere('status', 'CLOSED')['count']);
        $this->assertSame(0, $data['returns']['open_count']);
        $historical = $this->report('dashboard', '?range=custom&from=2020-01-01&to=2020-01-02')->assertOk()->json('data');
        $this->assertSame('0', $historical['sales']['values']['gross_minor']);
        $this->assertSame('0', $historical['sales']['values']['refunded_minor']);
        $this->assertSame(0, array_sum($historical['orders']['counts']));
        $this->assertDatabaseCount('payments', 2);
        $this->assertSame('PENDING_PAYMENT', Order::find($unpaid['id'])->status);
    }

    public function test_permission_matrix_and_mfa_are_enforced_for_each_endpoint(): void
    {
        $this->report()->assertUnauthorized();
        $this->login($this->customer());
        $this->report()->assertForbidden();
        foreach (['order_processing' => ['orders', 'returns'], 'inventory_store' => ['stock'], 'owner' => ['orders', 'returns', 'stock', 'sales', 'products', 'payments', 'notifications']] as $role => $allowed) {
            $u = $this->staff($role);
            $this->login($u);
            $this->report()->assertForbidden();
            $this->browser('GET', '/api/v1/auth/me')->assertOk()->assertJsonPath('data.permissions', []);
            $this->mfa();
            $grants = PermissionMatrix::grants()[$role];
            sort($grants);
            $this->browser('GET', '/api/v1/auth/me')->assertOk()->assertJsonPath('data.permissions', $grants);
            $data = $this->report()->assertOk()->json('data');
            foreach (['orders', 'returns', 'stock', 'sales', 'products', 'payments', 'notifications'] as $endpoint) {
                $response = $this->report($endpoint);
                if (in_array($endpoint, $allowed, true)) {
                    $response->assertOk();
                    $this->assertArrayHasKey($endpoint, $data);
                } else {
                    $response->assertForbidden();
                    $this->assertArrayNotHasKey($endpoint, $data);
                }
            }
            if ($role === 'order_processing') {
                $this->assertArrayNotHasKey('refund_counts', $data['returns']);
            }
        }
    }

    public function test_filters_reject_abuse_and_empty_reports_are_defined(): void
    {
        $this->login($this->owner);
        $this->mfa();
        foreach (['?range=bad', '?range[]=today', '?range=custom&from=2026-02-30&to=2026-03-02', '?range=custom&from=2020-01-01&to=2026-01-01', '?range=custom&from=2026-02-02&to=2026-01-01', '?range=custom&from=2999-01-01&to=2999-01-02', '?page=0', '?page=10001', '?timezone=UTC', '?sort=DROP%20TABLE%20orders', '?stock=1%20OR%201=1', '?range=custom&from=2026-01-01'] as $q) {
            $this->report('dashboard', $q)->assertUnprocessable();
        }
        $d = $this->report()->assertOk()->json('data');
        $this->assertSame('0', $d['sales']['values']['gross_minor']);
        $this->assertSame('NGN 0.00', $d['sales']['formatted']['net_minor']);
        $this->assertSame([], $d['products']['items']);
        $this->assertSame([], $d['stock']['items']);
        $this->assertSame([], $d['returns']['queue']);
        $this->assertSame(31, DB::table('permissions')->count());
    }

    public function test_stock_uses_balance_and_per_variant_threshold_with_unknown_distinct(): void
    {
        $v = $this->variant(5);
        $z = $this->variant(1);
        app(InventoryService::class)->adjustStock($z->id, -1, 'Sold out fixture', (string) Str::uuid(), $this->owner, (string) DB::table('inventory')->where('variant_id', $z->id)->value('version'));
        // Existing threshold configuration; reporting performs no writes.
        DB::table('inventory')->where('variant_id', $v->id)->update(['low_stock_threshold' => 5]);
        $missing = ProductVariant::create(['product_id' => $v->product_id, 'sku' => 'NO-BALANCE', 'option_signature' => 'unique', 'unit_price_minor' => '500', 'status' => 'active']);
        $report = app(StockReport::class)->read(1);
        $this->assertSame(2, $report['counts']->low_stock);
        $this->assertSame(1, $report['counts']->out_of_stock);
        $this->assertSame(1, $report['counts']->uninitialized);
        $unknown = collect($report['items'])->firstWhere('variant_id', $missing->id);
        $this->assertNull($unknown['on_hand']);
        $this->assertCount(2, app(StockReport::class)->read(1, 'low')['items']);
        $s = $this->prepared();
        $stock = DB::table('inventory')->where('reserved', 3)->first();
        $entry = collect(app(StockReport::class)->read(1)['items'])->firstWhere('variant_id', $stock->variant_id);
        $this->assertSame(7, $entry['available_quantity']);
        $this->assertSame(3, $entry['reserved']);
    }

    public function test_business_day_boundaries_and_refund_only_period_can_be_negative(): void
    {
        $w = ReportWindow::fromInput(['range' => 'custom', 'from' => '2026-09-20', 'to' => '2026-09-20'], 'Africa/Lagos');
        $this->assertSame('2026-09-19T23:00:00+00:00', $w->from->toIso8601String());
        $this->assertSame('2026-09-20T23:00:00+00:00', $w->until->toIso8601String());
        $q = DB::query()->fromRaw("(VALUES ('2026-09-19 22:59:59+00'::timestamptz),('2026-09-19 23:00:00+00'::timestamptz),('2026-09-20 22:59:59+00'::timestamptz),('2026-09-20 23:00:00+00'::timestamptz)) AS boundaries(at)");
        $this->assertSame(2, $w->apply($q, 'at')->count());
        $o = $this->delivered();
        $r = $this->received($this->requestReturn($o));
        $f = $this->refund($r);
        usleep(1100000);
        $before = CarbonImmutable::parse(DB::selectOne('SELECT clock_timestamp() AS time')->time)->startOfSecond();
        app(RefundService::class)->finalize($f->id, $this->pending($f), $this->observation($f), 'test');
        // A narrow synthetic observation window isolates completion from the earlier receipt.
        $refundWindow = new ReportWindow($before, CarbonImmutable::now()->addDay(), 'Africa/Lagos');
        $data = app(SalesReport::class)->read($refundWindow);
        $this->assertSame('0', $data['values']['gross_minor']);
        $this->assertSame('-369', $data['values']['net_minor']);
        $this->assertSame('-NGN 3.69', $data['formatted']['net_minor']);
        $this->assertSame('NGN 999,999,999,999,999,999,999.99', SalesReport::money('99999999999999999999999'));
    }

    public function test_return_open_approved_and_rejected_counts_and_pending_refund(): void
    {
        $w = ReportWindow::fromInput(['range' => '30d'], 'Africa/Lagos');
        $o = $this->delivered();
        $r = $this->requestReturn($o);
        $service = app(OperationsReport::class);
        $this->assertSame(1, $service->returns($w, true)['open_count']);
        $r = $this->approved($r);
        $this->assertSame(1, collect($service->returns($w, true)['counts'])->firstWhere('status', 'APPROVED')->count);
        $r = $this->returnAction($r, 'receive');
        $this->refund($r);
        $this->assertSame(1, collect($service->returns($w, true)['refund_counts'])->firstWhere('status', 'APPROVED')->count);
        $other = $this->requestReturn($this->delivered());
        $this->returnAction($other, 'reject');
        $d = $service->returns($w, true);
        $this->assertSame(1, collect($d['counts'])->firstWhere('status', 'REJECTED')->count);
        $this->assertSame(1, $d['open_count']);
    }

    public function test_opt_in_representative_hardening_workload(): void
    {
        if (getenv('IRANTI_HARDENING_PROFILE') !== '1') {
            $this->markTestSkipped('Opt-in synthetic performance and restore workload.');
        }
        $this->assertSame('54320', (string) config('database.connections.pgsql.port'));
        foreach (['checkout', 'payments', 'orders', 'cart'] as $limiter) {
            config(['limits.'.$limiter.'.principal' => 100000, 'limits.'.$limiter.'.network' => 100000]);
        }
        config(['limits.admin' => 100000, 'catalog.public_requests_per_minute' => 100000]);
        $customer = $this->customer();
        $this->login($customer);
        for ($n = 0; $n < 120; $n++) {
            $cart = $this->cartView();
            $this->browser('DELETE', '/api/v1/cart', ['expected_version' => $cart['version']])->assertOk();
            if ($n < 10) {
                $order = $this->delivered();
                $return = $this->requestReturn($order);
                if ($n < 5) {
                    $refund = $this->refund($this->inspected($this->received($return)));
                    $token = $this->pending($refund);
                    app(RefundService::class)->finalize($refund->id, $token, $this->observation($refund, (string) (800000 + $n)), 'test');
                }
            } elseif ($n < 90) {
                $this->paid();
            } else {
                $this->place($this->prepared())->assertCreated();
            }
        }
        for ($n = 0; $n < 30; $n++) {
            $this->variant(20, '125050');
        }
        app(NotificationDelivery::class)->relay();
        DB::statement('ANALYZE');
        $counts = [];
        foreach (['products', 'product_variants', 'orders', 'order_items', 'inventory', 'inventory_movements', 'payments', 'return_requests', 'refunds', 'notification_deliveries'] as $table) {
            $counts[$table] = DB::table($table)->count();
        }
        $measurements = [];
        $plans = [];
        $measure = function (string $path) use (&$measurements, &$plans): void {
            $times = [];
            for ($n = 0; $n < 20; $n++) {
                if ($n === 0) {
                    DB::enableQueryLog();
                }
                $started = hrtime(true);
                $this->browser('GET', '/api/v1/'.$path)->assertOk();
                $times[] = (hrtime(true) - $started) / 1_000_000;
                if ($n === 0) {
                    $queries = DB::getQueryLog();
                    DB::disableQueryLog();
                    DB::flushQueryLog();
                    foreach ($queries as $query) {
                        if (! str_starts_with(strtolower($query['query']), 'select')) {
                            continue;
                        }
                        $plan = DB::select('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '.$query['query'], $query['bindings']);
                        $plans[] = ['endpoint' => $path, 'sql' => $query['query'], 'plan' => json_decode($plan[0]->{'QUERY PLAN'}, true)];
                    }
                }
            }
            sort($times);
            $measurements[$path] = ['samples' => count($times), 'median_ms' => ($times[9] + $times[10]) / 2, 'p95_ms' => $times[18], 'max_ms' => max($times)];
        };
        foreach (['products', 'search?q=product', 'cart', 'orders'] as $path) {
            $measure($path);
        }
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($this->owner);
        $this->mfa();
        foreach (['admin/inventory', 'admin/orders', 'admin/dashboard', 'admin/payments', 'admin/returns'] as $path) {
            $measure($path);
        }
        $directory = base_path('../.runtime/hardening-verification');
        file_put_contents($directory.'/performance.json', json_encode(['profile' => 'Fixed 150 products/120 orders; synthetic state mix, generated UUIDs and relative current dates; 20 sequential in-process HTTP samples, not a load SLA', 'counts' => $counts, 'endpoints' => $measurements], JSON_PRETTY_PRINT));
        file_put_contents($directory.'/query-plans.json', json_encode($plans, JSON_PRETTY_PRINT));
    }
}
