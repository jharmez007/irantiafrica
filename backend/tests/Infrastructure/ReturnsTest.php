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
use App\Payments\PaymentService;
use App\Payments\RefundVerification;
use App\Payments\WebhookInbox;
use App\Returns\RefundService;
use App\Returns\ReturnPolicy;
use App\Returns\ReturnService;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Database\QueryException;
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

final class ReturnsTest extends TestCase
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

    public function test_historical_partial_allocations_and_preserved_delivery(): void
    {
        $o = $this->delivered();
        $original = $o->getAttributes();
        $amounts = [];
        for ($i = 0; $i < 3; $i++) {
            $r = $this->received($this->requestReturn($o));
            $refund = $this->refund($r);
            $amounts[] = (int) $refund->amount_minor;
            $this->assertSame($refund->id, $this->refund($r)->id);
        }
        $this->assertSame([369, 369, 368], $amounts);
        $this->assertSame($original, $o->fresh()->getAttributes());
        $this->assertSame(7, DB::table('inventory')->value('on_hand'));
        $line = DB::table('order_items')->where('order_id', $o->id)->firstOrFail();
        $this->browser('POST', '/api/v1/orders/'.$o->id.'/returns', ['reason_code' => 'DAMAGED_PRODUCT', 'items' => [['order_item_id' => $line->id, 'quantity' => 1]]])->assertStatus(409);
    }

    public function test_guest_scope_validation_window_replay_and_rejection_release(): void
    {
        $o = $this->delivered();
        $this->browser('GET', '/api/v1/orders/'.$o->id.'/returns')->assertOk()->assertJsonPath('data.eligibility.eligible', true);
        $policy = app(ReturnPolicy::class);
        $cutoff = $policy->evaluate($o)['cutoff'];
        $this->assertFalse($policy->evaluate($o, null, $cutoff)['eligible']);
        $this->assertTrue($policy->evaluate($o, null, $cutoff->subMicrosecond())['eligible']);
        $line = DB::table('order_items')->where('order_id', $o->id)->firstOrFail();
        $payload = ['reason_code' => 'DAMAGED_PRODUCT', 'items' => [['order_item_id' => $line->id, 'quantity' => 1]]];
        foreach ([['reason_code' => 'CHANGED_MIND'], ['amount_minor' => '1'], ['items' => [['order_item_id' => $line->id, 'quantity' => 0]]], ['items' => [['order_item_id' => $line->id, 'quantity' => 1.5]]]] as $bad) {
            $this->browser('POST', '/api/v1/orders/'.$o->id.'/returns', array_replace($payload, $bad))->assertStatus(422);
        }
        $this->operationKey = (string) Str::uuid();
        $r = $this->requestReturn($o);
        $this->assertSame($r->id, $this->requestReturn($o)->id);
        $this->operationKey = null;
        $this->returnAction($r, 'reject');
        $this->assertSame(0, DB::table('return_units')->where('active', true)->count());
        $this->requestReturn($o, 3);
        $this->jar = [];
        $this->browser('GET', '/api/v1/orders/'.$o->id.'/returns')->assertNotFound();
    }

    public function test_customer_idor_staff_mfa_and_amount_injection(): void
    {
        $o = $this->delivered($this->customer());
        $r = $this->requestReturn($o);
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($this->customer());
        $this->browser('GET', '/api/v1/orders/'.$o->id.'/returns')->assertNotFound();
        $this->browser('GET', '/api/v1/admin/returns')->assertForbidden();
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($this->owner);
        $this->browser('GET', '/api/v1/admin/returns')->assertForbidden();
        $this->mfa();
        $this->browser('GET', '/api/v1/admin/returns')->assertOk();
        $r = $this->received($r);
        $this->browser('POST', '/api/v1/admin/returns/'.$r->id.'/refund/approve', ['expected_version' => $r->version, 'note' => 'Owner approval', 'amount_minor' => '1'])->assertStatus(422);
        $this->browser('POST', '/api/v1/admin/returns/'.$r->id.'/refund/approve', ['expected_version' => $r->version, 'note' => 'Owner approval'])->assertOk()->assertJsonPath('data.refund.amount_minor', '369');
    }

    public function test_provider_submit_verify_replay_and_unknown_no_repost(): void
    {
        $o = $this->delivered();
        $refund = $this->refund($this->received($this->requestReturn($o, 2)));
        $v = $this->observation($refund);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['api.paystack.co/refund*' => Http::response(['status' => true, 'data' => ['id' => $v->providerId, 'transaction' => $v->transactionId, 'amount' => (int) $v->amount, 'currency' => 'NGN', 'domain' => 'test', 'merchant_note' => $v->merchantReference, 'status' => 'processed']])]);
        $service = app(RefundService::class);
        $this->assertSame('SUCCEEDED', $service->submit($refund->id, $this->owner)->status);
        $this->assertSame('SUCCEEDED', $service->submit($refund->id, $this->owner)->status);
        Http::assertSentCount(2);
        $this->assertSame(1, DB::table('refund_attempts')->count());
        $this->assertSame('DELIVERED', $o->fresh()->status);
        $this->assertSame(7, DB::table('inventory')->value('on_hand'));
        $other = $this->refund($this->received($this->requestReturn($o)));
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::failedConnection()]);
        $this->assertSame('UNKNOWN', $service->submit($other->id, $this->owner)->status);
        $service->submit($other->id, $this->owner);
        $this->assertSame(2, DB::table('refund_attempts')->count());
        $this->assertSame(1106, (int) DB::table('refunds')->where('status', '<>', 'FAILED')->sum('amount_minor'));
    }

    public function test_restock_is_separate_and_damaged_never_restocks(): void
    {
        $o = $this->delivered();
        $r = $this->inspected($this->received($this->requestReturn($o)));
        $r = $this->returnAction($r, 'restock');
        $this->returnAction($r, 'restock');
        $this->assertSame(8, DB::table('inventory')->value('on_hand'));
        $this->assertSame(1, DB::table('inventory_movements')->where('kind', 'RESTOCK')->count());
        $damaged = $this->inspected($this->received($this->requestReturn($o)), 'DAMAGED');
        try {
            $this->returnAction($damaged, 'restock');
            $this->fail('Damaged restock accepted');
        } catch (CheckoutConflict) {
        }
        $this->assertSame(8, DB::table('inventory')->value('on_hand'));
        $this->assertSame(0, DB::table('refunds')->count());
    }

    public function test_six_required_postgresql_races(): void
    {
        $o = $this->delivered();
        $r = $this->received($this->requestReturn($o));
        $a = $this->race(fn () => $this->refund($r)->id);
        $this->assertSame($a[0], $a[1]);
        $refund = DB::table('refunds')->firstOrFail();
        $token = $this->pending($refund);
        $v = $this->observation($refund);
        $this->assertSame(['ok', 'ok'], $this->race(function () use ($refund, $token, $v) {
            app(RefundService::class)->finalize($refund->id, $token, $v, 'test');

            return 'ok';
        }));
        $this->assertSame(1, DB::table('return_events')->where('event', 'RefundSucceeded')->count());
        $r = $this->inspected(DB::table('return_requests')->where('id', $r->id)->firstOrFail());
        $this->assertSame(['ok', 'ok'], $this->race(function () use ($r) {
            $this->returnAction($r, 'restock');

            return 'ok';
        }));
        $this->assertSame(8, DB::table('inventory')->value('on_hand'));
        $next = $this->requestReturn($o);
        $decisions = $this->race(fn ($i) => $i === 0 ? $this->approved($next)->status : $this->returnAction($next, 'reject')->status);
        $this->assertContains('RETURN_CONFLICT', $decisions);
        $next = DB::table('return_requests')->where('id', $next->id)->firstOrFail();
        if ($next->status === 'REJECTED') {
            $next = $this->approved($this->requestReturn($o));
        }
        $next = $this->returnAction($next, 'receive');
        $third = $this->received($this->requestReturn($o));
        $this->race(fn ($i) => $this->refund($i === 0 ? $next : $third)->id);
        $this->assertSame(1106, (int) DB::table('refunds')->sum('amount_minor'));
        $f = DB::table('refunds')->where('return_request_id', $next->id)->firstOrFail();
        $token = $this->pending($f);
        $v = $this->observation($f, '987654321');
        $attempt = DB::table('payment_attempts')->where('order_id', $o->id)->firstOrFail();
        $this->provider('success', ['id' => $v->transactionId]);
        $this->assertSame(['ok', 'ok'], $this->race(function ($i) use ($f, $token, $v, $attempt) {
            if ($i === 0) {
                app(RefundService::class)->finalize($f->id, $token, $v, 'test');
            } else {
                app(PaymentService::class)->verify($attempt->id, 'owner');
            }

            return 'ok';
        }));
        $this->assertSame('DELIVERED', $o->fresh()->status);
        $this->assertSame(1, DB::table('inventory_movements')->where('kind', 'RESTOCK')->count());
    }

    public function test_database_guards_immutable_evidence_quantities_and_refund_states(): void
    {
        $o = $this->delivered();
        $r = $this->received($this->requestReturn($o));
        $refund = $this->refund($r);
        $item = DB::table('return_items')->where('return_request_id', $r->id)->firstOrFail();
        $unit = DB::table('return_units')->where('return_item_id', $item->id)->firstOrFail();
        $mutations = [
            fn () => DB::table('return_status_history')->where('return_request_id', $r->id)->update(['note' => 'tampered']),
            fn () => DB::table('return_units')->where('id', $unit->id)->update(['tax_minor' => 0]),
            fn () => DB::table('return_units')->where('id', $unit->id)->update(['active' => false]),
            fn () => DB::table('return_items')->where('id', $item->id)->update(['approved_quantity' => 0, 'received_quantity' => 0]),
            fn () => DB::table('refunds')->where('id', $refund->id)->update(['amount_minor' => 1]),
            fn () => DB::table('refunds')->where('id', $refund->id)->update(['status' => 'SUCCEEDED']),
            fn () => DB::table('return_requests')->where('id', $r->id)->update(['status' => 'REJECTED', 'version' => $r->version + 1]),
        ];
        foreach ($mutations as $mutation) {
            try {
                DB::transaction($mutation);
                $this->fail('Database accepted invalid evidence mutation');
            } catch (QueryException $e) {
                $this->assertStringContainsString('P0001', $e->getMessage());
            }
        }
    }

    public function test_provider_identity_mismatch_stale_fence_failure_and_signed_refund_webhook(): void
    {
        $o = $this->delivered();
        $refund = $this->refund($this->received($this->requestReturn($o, 3)));
        $token = $this->pending($refund);
        $valid = $this->observation($refund);
        $service = app(RefundService::class);
        $service->finalize($refund->id, (string) Str::uuid(), $valid, 'test');
        $this->assertSame('SUBMITTING', DB::table('refunds')->value('status'));
        $wrong = new RefundVerification('SUCCEEDED', $valid->providerId, $valid->transactionId, '1', 'NGN', $valid->merchantReference, 'test');
        $service->finalize($refund->id, $token, $wrong, 'test');
        $this->assertSame('UNKNOWN', DB::table('refunds')->value('status'));
        $this->assertNull(DB::table('refunds')->value('provider_refund_id'));
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['api.paystack.co/refund/*' => Http::response(['status' => true, 'data' => ['id' => $valid->providerId, 'transaction' => $valid->transactionId, 'amount' => (int) $valid->amount, 'currency' => 'NGN', 'domain' => 'test', 'merchant_note' => $valid->merchantReference, 'status' => 'processing']])]);
        $service->verify($refund->id, 'owner', $valid->providerId, $this->owner->id);
        $this->assertSame('PENDING', DB::table('refunds')->value('status'));
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['api.paystack.co/refund/*' => Http::response(['status' => true, 'data' => ['id' => $valid->providerId, 'transaction' => $valid->transactionId, 'amount' => (int) $valid->amount, 'currency' => 'NGN', 'domain' => 'test', 'merchant_note' => $valid->merchantReference, 'status' => 'failed']])]);
        $reference = DB::table('payment_attempts')->where('order_id', $o->id)->value('reference');
        $body = json_encode(['event' => 'refund.failed', 'data' => ['transaction_reference' => $reference]]);
        $inbox = app(WebhookInbox::class);
        $signature = hash_hmac('sha512', $body, config('payments.secret_key'));
        $inbox->accept($body, $signature);
        $inbox->accept($body, $signature);
        $this->assertSame(1, DB::table('webhook_inbox')->count());
        $id = DB::table('webhook_inbox')->value('id');
        $inbox->process($id);
        $inbox->process($id);
        $this->assertSame('FAILED', DB::table('refunds')->value('status'));
        $this->assertSame(1, DB::table('return_events')->where('event', 'RefundFailed')->count());
        $this->assertSame(7, DB::table('inventory')->value('on_hand'));
    }

    public function test_order_staff_can_review_but_cannot_decide_refund_or_restock(): void
    {
        $o = $this->delivered();
        $r = $this->requestReturn($o);
        $staff = $this->staff('order_processing');
        $this->login($staff);
        $this->mfa();
        $this->browser('GET', '/api/v1/admin/returns')->assertOk();
        $this->browser('POST', '/api/v1/admin/returns/'.$r->id.'/review', ['expected_version' => $r->version, 'note' => 'Intake review'])->assertOk();
        foreach (['approve', 'reject', 'restock', 'refund/approve', 'refund/submit'] as $action) {
            $this->browser('POST', '/api/v1/admin/returns/'.$r->id.'/'.$action, ['expected_version' => 2, 'note' => 'Not permitted'])->assertForbidden();
        }
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($this->owner);
        $this->mfa();
        $r = DB::table('return_requests')->where('id', $r->id)->firstOrFail();
        $r = $this->received($r);
        $this->app['session.store']->put('recent_auth_at', time() - 301);
        $this->app['session.store']->save();
        $this->browser('POST', '/api/v1/admin/returns/'.$r->id.'/refund/approve', ['expected_version' => $r->version, 'note' => 'Stale authentication'])->assertForbidden();
    }

    public function test_explicit_no_receipt_policy_does_not_imply_inspection_or_restock(): void
    {
        $o = $this->delivered();
        $current = app(ReturnPolicy::class)->current();
        $policy = json_decode($current->policy, true);
        $policy['cutoff'] = 'ELAPSED_24_HOURS';
        $row = (object) ['policy' => json_encode($policy)];
        $evaluation = app(ReturnPolicy::class)->evaluate($o, $row);
        $this->assertTrue($evaluation['cutoff']->equalTo($evaluation['anchor']->utc()->addHours(24)));
        $this->assertFalse(app(ReturnPolicy::class)->evaluate($o, $row, $evaluation['cutoff'])['eligible']);
        $policy['physical_receipt_required'] = false;
        app(ReturnPolicy::class)->publish(['version_code' => 'explicit-no-receipt', 'development_only' => true, 'approval_reference' => 'Synthetic alternate-policy fixture only', 'policy' => $policy], $this->owner);
        $r = $this->approved($this->requestReturn($o));
        $refund = $this->refund($r);
        $token = $this->pending($refund);
        app(RefundService::class)->finalize($refund->id, $token, $this->observation($refund), 'test');
        $r = DB::table('return_requests')->where('id', $r->id)->firstOrFail();
        $view = app(ReturnService::class)->projection($r, $this->owner->fresh());
        $this->assertSame('CLOSED', $r->status);
        $this->assertTrue($view['actions']['receive']);
        $this->assertFalse($view['actions']['inspect']);
        $this->assertFalse($view['actions']['restock']);
        $r = $this->returnAction($r, 'receive');
        $this->assertSame('CLOSED', $r->status);
        $this->returnAction($this->inspected($r), 'restock');
        $this->assertSame(8, DB::table('inventory')->value('on_hand'));
    }
}
