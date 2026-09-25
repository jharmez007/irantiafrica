<?php

namespace Tests\Infrastructure;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Jobs\ReconcilePayment;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Reservation;
use App\Models\Role;
use App\Models\User;
use App\Payments\PaymentService;
use App\Payments\PaystackGateway;
use App\Payments\WebhookInbox;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

final class PaymentTest extends TestCase
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

    private function webhook(string $ref, string $event = 'charge.success', ?string $signature = null): TestResponse
    {
        $body = json_encode(['event' => $event, 'data' => ['reference' => $ref, 'id' => '18446744073709551615', 'authorization' => ['authorization_code' => 'DO_NOT_RETAIN'], 'customer' => ['email' => 'DO_NOT_RETAIN']]]);

        return $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_PAYSTACK_SIGNATURE' => $signature ?? hash_hmac('sha512', $body, config('payments.secret_key'))], $body);
    }

    private function paidOnce(): void
    {
        $this->assertSame('PAID', Order::firstOrFail()->status);
        $this->assertSame('SUCCESSFUL', Order::firstOrFail()->payment_state);
        $this->assertSame(7, Inventory::sum('on_hand'));
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertSame(1, DB::table('payments')->whereNotNull('applied_at')->count());
        $this->assertSame(1, DB::table('order_status_history')->where('event', 'OrderPaid')->count());
        $this->assertSame(1, DB::table('payment_events')->where('event', 'PaymentSucceeded')->count());
    }

    public function test_owned_server_authoritative_initialization_idempotency_secret_hygiene_and_verified_success(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        foreach (['amount' => '1', 'currency' => 'USD', 'user_id' => (string) Str::uuid(), 'reference' => 'mine', 'status' => 'success'] as $key => $value) {
            $this->browser('POST', '/api/v1/orders/'.$o['id'].'/payment-attempts', ['method' => 'card', $key => $value])->assertUnprocessable();
        }
        $this->operationKey = (string) Str::uuid();
        $a = $this->init($o)->assertCreated()->json('data');
        $this->init($o)->assertCreated()->assertJsonPath('data.id', $a['id']);
        $this->init($o, 'bank_transfer')->assertConflict();
        $this->operationKey = null;
        $this->init($o)->assertConflict();
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/initialize') && $r['amount'] === '1662' && $r['currency'] === 'NGN' && $r['email'] === 'checkout@example.test' && $r['callback_url'] === 'http://localhost:3000/orders/'.$o['id'].'/payment-return');
        $row = DB::table('payment_attempts')->first();
        $this->assertStringNotContainsString('checkout.paystack.com', $row->authorization_url);
        $this->browser('POST', '/api/v1/orders/'.$o['id'].'/cancel', ['expected_version' => 2, 'reason' => 'No'])->assertConflict();
        $this->verifyApi($o, $a)->assertOk()->assertJsonPath('data.order.status', 'PAID')->assertDontSee('sk_test_');
        $this->verifyApi($o, $a)->assertOk();
        $this->paidOnce();
        $this->assertSame('18446744073709551615', DB::table('payments')->value('provider_transaction_id'));
        $this->init($o)->assertConflict();
        $this->assertDatabaseCount('cart_items', 1);
    }

    public function test_webhook_signature_raw_bytes_inbox_deduplication_quarantine_and_recovery(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->webhook($a['reference'], 'charge.success', 'bad')->assertUnauthorized();
        $this->assertDatabaseCount('webhook_inbox', 0);
        $this->webhook($a['reference'])->assertOk();
        $this->webhook($a['reference'])->assertOk();
        $this->assertDatabaseCount('webhook_inbox', 1);
        $this->assertSame('PENDING_PAYMENT', Order::firstOrFail()->status);
        $this->assertStringNotContainsString('DO_NOT_RETAIN', DB::table('webhook_inbox')->value('normalized'));
        Artisan::call('payments:reconcile', ['--inline' => true]);
        $this->paidOnce();
        $this->assertSame('DONE', DB::table('webhook_inbox')->value('status'));
        $this->webhook('unknown')->assertOk();
        $this->webhook($a['reference'], 'transfer.success')->assertOk();
        Artisan::call('payments:reconcile', ['--inline' => true]);
        $this->assertSame(2, DB::table('webhook_inbox')->where('status', 'QUARANTINED')->count());
        $body = '{"event":"charge.success"} ';
        $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], ['HTTP_X_PAYSTACK_SIGNATURE' => hash_hmac('sha512', trim($body), config('payments.secret_key'))], $body)->assertUnauthorized();
        $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], [], str_repeat('x', 262145))->assertStatus(413);
    }

    public function test_api_ownership_csrf_reference_guessing_and_rate_limit(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $path = '/api/v1/orders/'.$o['id'].'/payment-attempts/'.$a['id'].'/verify';
        $this->browser('POST', $path, [], false)->assertStatus(419);
        $this->browser('POST', $path, [], true, 'https://evil.example')->assertForbidden();
        $this->browser('POST', $path, ['status' => 'success'])->assertUnprocessable();
        $this->browser('POST', '/api/v1/orders/'.$o['id'].'/payment-attempts/'.Str::uuid().'/verify')->assertNotFound();
        $jar = $this->jar;
        $this->jar = [];
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
        $this->browser('GET', '/api/v1/orders/'.$o['id'].'/payment-status')->assertNotFound();
        $this->init($o)->assertNotFound();
        $this->jar = $jar;
        $limited = false;
        for ($i = 0; $i < 15; $i++) {
            if ($this->browser('POST', $path)->status() === 429) {
                $limited = true;
                break;
            }
        }
        $this->assertTrue($limited);
    }

    public function test_failed_abandoned_pending_and_safe_same_order_retry(): void
    {
        $this->provider('failed');
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->verifyApi($o, $a)->assertOk()->assertJsonPath('data.order.payment.state', 'FAILED');
        $this->assertSame(3, Inventory::sum('reserved'));
        $expiry = Reservation::firstOrFail()->expires_at;
        $this->provider('abandoned');
        $b = $this->init($o, 'bank_transfer')->assertCreated()->json('data');
        $this->assertNotSame($a['id'], $b['id']);
        $this->verifyApi($o, $b)->assertOk()->assertJsonPath('data.order.payment.state', 'ABANDONED');
        $this->provider('ongoing');
        $c = $this->init($o)->assertCreated()->json('data');
        $this->verifyApi($o, $c)->assertOk()->assertJsonPath('data.order.payment.state', 'PENDING');
        $this->init($o)->assertConflict();
        $this->assertTrue($expiry->equalTo(Reservation::firstOrFail()->expires_at));
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('payment_attempts', 3);
    }

    public function test_mismatched_amount_currency_reference_domain_and_reversal_never_consume(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        foreach ([['amount' => 1], ['currency' => 'USD'], ['reference' => 'wrong'], ['domain' => 'live'], ['status' => 'reversed']] as $override) {
            $this->provider('success', $override);
            $this->verifyApi($o, $a)->assertOk()->assertJsonPath('data.order.payment.state', 'REQUIRES_REVIEW');
        }
        $this->assertSame(10, Inventory::sum('on_hand'));
        $this->assertSame(0, DB::table('payments')->whereNotNull('applied_at')->count());
        $this->init($o)->assertConflict();
        foreach (['UPDATE payments SET amount_minor=1', 'DELETE FROM payment_reconciliation_records', 'UPDATE payment_attempts SET expected_amount_minor=1'] as $sql) {
            try {
                DB::statement($sql);
                $this->fail('Financial evidence mutable');
            } catch (QueryException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_expired_hold_retains_verified_receipt_without_consuming_or_reacquiring(): void
    {
        config(['inventory.reservation_ttl_seconds' => 2]);
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        sleep(3);
        $this->verifyApi($o, $a)->assertOk()->assertJsonPath('data.order.status', 'PAYMENT_REVIEW');
        $this->assertSame('RESERVATION_ENDED', DB::table('payments')->value('exception_code'));
        $this->assertSame(10, Inventory::sum('on_hand'));
        $this->assertSame(0, Inventory::sum('reserved'));
        $this->assertDatabaseCount('reservations', 1);
    }

    public function test_cancelled_order_blocks_init_and_late_evidence_preserves_cancellation(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $this->browser('POST', '/api/v1/orders/'.$o['id'].'/cancel', ['expected_version' => 1, 'reason' => 'Cancel'])->assertOk();
        $this->init($o)->assertConflict();
        // Imported delayed provider evidence simulates a legacy/out-of-band event; no customer bypass route.
        $id = (string) Str::uuid();
        DB::table('payment_attempts')->insert(['id' => $id, 'order_id' => $o['id'], 'provider' => 'paystack', 'reference' => 'IRA-P-late', 'request_key' => (string) Str::uuid(), 'method' => 'card', 'expected_amount_minor' => '1662', 'currency' => 'NGN', 'status' => 'UNKNOWN']);
        app(PaymentService::class)->verify($id, 'admin');
        $this->assertSame('CANCELLED', Order::firstOrFail()->status);
        $this->assertSame('REQUIRES_REVIEW', Order::firstOrFail()->payment_state);
        $this->assertSame(10, Inventory::sum('on_hand'));
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_uncertain_init_never_blindly_retries_and_recovery_is_bounded(): void
    {
        Http::fake(['*' => Http::response([], 503)]);
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->assertSame('UNKNOWN', $a['status']);
        $this->init($o)->assertConflict();
        config(['payments.max_checks' => 2]);
        app(PaymentService::class)->verify($a['id'], 'admin');
        app(PaymentService::class)->verify($a['id'], 'admin');
        $row = DB::table('payment_attempts')->first();
        $this->assertSame('RECONCILIATION_EXHAUSTED', $row->failure_code);
        $this->assertNull($row->next_check_at);
        $this->init($o)->assertConflict();
    }

    public function test_admin_mfa_and_role_restrictions(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->login($this->staff('order_processing'));
        $this->mfa();
        $this->browser('GET', '/api/v1/admin/payments')->assertForbidden();
        $this->browser('GET', '/api/v1/admin/orders/'.$o['id'])->assertOk()->assertJsonMissingPath('data.attempts');
        $this->login($this->owner);
        $this->browser('GET', '/api/v1/admin/payments')->assertForbidden();
        $this->mfa();
        $this->browser('GET', '/api/v1/admin/payments')->assertOk()->assertJsonCount(1, 'data.items')->assertJsonMissingPath('data.items.0.authorization_url');
        $this->browser('POST', '/api/v1/admin/payments/'.$a['id'].'/reconcile')->assertOk()->assertJsonPath('data.status', 'SUCCEEDED')->assertJsonPath('data.receipts.0.amount_minor', '1662');
        $this->paidOnce();
    }

    public function test_provider_adapter_fail_closed_mode_redirect_and_big_integer_validation(): void
    {
        $g = new PaystackGateway;
        $this->assertTrue($g->ready());
        config(['payments.secret_key' => 'sk_live_'.str_repeat('0', 32)]);
        $this->assertFalse($g->ready());
        config(['payments.secret_key' => 'sk_test_00000000000000000000000000000000']);
        Http::fake(['*' => Http::response(['status' => true, 'data' => ['reference' => 'ref', 'authorization_url' => 'https://checkout.paystack.com.evil.example/token']])]);
        $this->assertNull($g->initializePayment('ref', '100', 'NGN', 'x@example.test', 'http://localhost:3000', 'card'));
        Http::swap(new Factory);
        Http::fake(['*' => Http::response(['status' => true, 'data' => ['id' => 1.2, 'reference' => 'ref', 'amount' => 100, 'currency' => 'NGN', 'channel' => 'card', 'domain' => 'test', 'status' => 'success']])]);
        $this->assertSame('UNKNOWN', $g->verifyPayment('ref')->state);
    }

    public function test_postgres_race_webhook_and_browser_finalize_once(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->webhook($a['reference'])->assertOk();
        $inbox = DB::table('webhook_inbox')->value('id');
        $this->race(function ($i) use ($a, $inbox) {
            if ($i === 0) {
                app(WebhookInbox::class)->process($inbox);
            } else {
                app(PaymentService::class)->verify($a['id'], 'browser');
            }

            return 'ok';
        });
        $this->paidOnce();
    }

    public function test_postgres_duplicate_webhook_delivery_and_processing(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $body = json_encode(['event' => 'charge.success', 'data' => ['reference' => $a['reference'], 'id' => 123]]);
        $signature = hash_hmac('sha512', $body, config('payments.secret_key'));
        $this->race(function ($i) use ($body, $signature) {
            $svc = app(WebhookInbox::class);
            $svc->accept($body, $signature);
            $svc->process(DB::table('webhook_inbox')->value('id'));

            return 'ok';
        });
        $this->assertDatabaseCount('webhook_inbox', 1);
        $this->paidOnce();
    }

    public function test_postgres_concurrent_initialization_has_one_active_intent(): void
    {
        $this->provider();
        $u = $this->customer();
        $o = $this->place($this->prepared($u))->assertCreated()->json('data');
        $results = $this->race(fn ($i) => app(PaymentService::class)->initialize($o['id'], $u, null, (string) Str::uuid(), 'card')->id);
        $this->assertContains('PAYMENT_ACTIVE', $results);
        $this->assertDatabaseCount('payment_attempts', 1);
    }

    public function test_postgres_retry_racing_previous_late_success_retains_extra_money(): void
    {
        $this->provider('failed');
        $u = $this->customer();
        $o = $this->place($this->prepared($u))->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->verifyApi($o, $a)->assertOk();
        $this->provider();
        $this->race(fn ($i) => $i === 0 ? app(PaymentService::class)->initialize($o['id'], $u, null, (string) Str::uuid(), 'card')->id : (app(PaymentService::class)->verify($a['id'], 'webhook') ? 'ok' : 'leased'));
        $this->paidOnce();
        if ($other = DB::table('payment_attempts')->where('id', '<>', $a['id'])->first()) {
            $this->provider('success', ['id' => '123']);
            app(PaymentService::class)->verify($other->id, 'webhook');
            $this->assertDatabaseCount('payments', 2);
            $this->assertTrue(Order::firstOrFail()->financial_hold);
            $this->assertSame(1, DB::table('payments')->whereNotNull('applied_at')->count());
            $this->assertSame(7, Inventory::sum('on_hand'));
        }
    }

    public function test_postgres_expiry_racing_verified_payment_never_oversells(): void
    {
        config(['inventory.reservation_ttl_seconds' => 2]);
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $rid = Order::firstOrFail()->current_reservation_id;
        sleep(2);
        $this->race(function ($i) use ($a, $rid) {
            if ($i === 0) {
                app(InventoryService::class)->expire($rid);
            } else {
                app(PaymentService::class)->verify($a['id'], 'browser');
            }

            return 'ok';
        });
        $this->assertSame('PAYMENT_REVIEW', Order::firstOrFail()->status);
        $this->assertSame(10, Inventory::sum('on_hand'));
        $this->assertSame(0, Inventory::sum('reserved'));
    }

    public function test_provider_transaction_collision_is_retained_as_review_evidence(): void
    {
        $this->provider('failed');
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->verifyApi($o, $a)->assertOk();
        $b = $this->init($o)->assertCreated()->json('data');
        $this->provider();
        app(PaymentService::class)->verify($a['id'], 'webhook');
        app(PaymentService::class)->verify($b['id'], 'browser');
        $this->assertSame(1, DB::table('payments')->count());
        $this->assertTrue(Order::firstOrFail()->financial_hold);
        $this->assertSame(7, Inventory::sum('on_hand'));
        $this->assertSame(1, DB::table('payment_reconciliation_records')->where('outcome', 'PROVIDER_REFERENCE_COLLISION')->count());
    }

    public function test_scheduler_respects_due_time_and_429_retry_after(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->assertFalse(app(PaymentService::class)->verify($a['id'], 'scheduler'));
        Http::swap(new Factory);
        Http::fake(['*' => Http::response([], 429, ['Retry-After' => '1800'])]);
        app(PaymentService::class)->verify($a['id'], 'admin');
        $row = DB::table('payment_attempts')->first();
        $this->assertSame('UNKNOWN', $row->status);
        $this->assertGreaterThan(1700, now()->diffInSeconds($row->next_check_at));
        $migration = require database_path('migrations/2026_09_23_000011_create_payments.php');
        try {
            $migration->down();
            $this->fail('Populated financial schema rollback accepted');
        } catch (\LogicException) {
            $this->assertDatabaseCount('payment_attempts', 1);
        }
    }

    public function test_distinct_second_success_preserves_both_receipts_and_one_stock_sale(): void
    {
        $this->provider('failed');
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->verifyApi($o, $a)->assertOk();
        $b = $this->init($o)->assertCreated()->json('data');
        $this->provider();
        app(PaymentService::class)->verify($a['id'], 'webhook');
        $this->provider('success', ['id' => '222']);
        app(PaymentService::class)->verify($b['id'], 'webhook');
        $this->assertDatabaseCount('payments', 2);
        $this->assertSame(1, DB::table('payments')->whereNotNull('applied_at')->count());
        $this->assertSame('PAID', Order::firstOrFail()->status);
        $this->assertTrue(Order::firstOrFail()->financial_hold);
        $this->assertSame(7, Inventory::sum('on_hand'));
        $this->assertSame(1, DB::table('payment_events')->where('event', 'PaymentSucceeded')->count());
    }

    public function test_payment_job_runs_through_isolated_redis_queue(): void
    {
        $this->provider();
        $o = $this->place($this->prepared())->assertCreated()->json('data');
        $a = $this->init($o)->assertCreated()->json('data');
        $this->webhook($a['reference'])->assertOk();
        $inbox = DB::table('webhook_inbox')->value('id');
        $queue = 'payment-test-'.Str::uuid();
        try {
            Queue::connection('redis')->push(new ReconcilePayment($inbox, true), '', $queue);
            Artisan::call('queue:work', ['connection' => 'redis', '--queue' => $queue, '--once' => true, '--tries' => 1, '--timeout' => 30]);
            $this->paidOnce();
            $this->assertSame('DONE', DB::table('webhook_inbox')->value('status'));
            $this->assertSame(0, DB::table('failed_jobs')->where('queue', $queue)->count());
        } finally {
            Queue::connection('redis')->clear($queue);
        }
    }
}
