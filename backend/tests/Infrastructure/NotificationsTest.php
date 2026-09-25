<?php

namespace Tests\Infrastructure;

use App\Checkout\CheckoutConfiguration;
use App\Checkout\CheckoutConflict;
use App\Communications\MailTransport;
use App\Communications\NotificationContent;
use App\Communications\NotificationDelivery;
use App\Communications\TransactionalMail;
use App\Fulfilment\FulfilmentService;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Jobs\DeliverTransactionalEmail;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use App\Payments\RefundVerification;
use App\Returns\RefundService;
use App\Returns\ReturnPolicy;
use App\Returns\ReturnService;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Client\Factory;
use Illuminate\Mail\MailManager;
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
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\TestCase;

final class NotificationsTest extends TestCase
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

    private function deliveries(): void
    {
        $service = app(NotificationDelivery::class);
        $service->relay();
        foreach (DB::table('notification_deliveries')->pluck('id') as $id) {
            $service->deliver($id);
        }
    }

    public function test_committed_lifecycle_guest_recipient_templates_and_deduplication(): void
    {
        $o = $this->delivered();
        $r = $this->received($this->requestReturn($o));
        $f = $this->refund($r);
        $token = $this->pending($f);
        app(RefundService::class)->finalize($f->id, $token, $this->observation($f), 'test');
        $service = app(NotificationDelivery::class);
        $this->assertSame(8, $service->relay());
        $this->assertSame(0, $service->relay());
        Queue::assertPushed(DeliverTransactionalEmail::class);
        foreach (DB::table('notification_deliveries')->pluck('id') as $id) {
            $service->deliver($id);
            $service->deliver($id);
        }
        $this->assertSame(8, DB::table('notification_deliveries')->where('status', 'SIMULATED')->count());
        $messages = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(8, $messages);
        foreach ($messages as $sent) {
            $email = $sent->getOriginalMessage();
            $this->assertSame($o->contact_email, $email->getTo()[0]->getAddress());
            $this->assertNotEmpty($email->getTextBody());
            $this->assertStringNotContainsString('Private packing instruction', $email->getHtmlBody());
            $this->assertStringNotContainsString('guest_token', $email->getHtmlBody());
            $this->assertStringNotContainsString('/account/orders/', $email->getHtmlBody());
        }
        $this->assertSame('DELIVERED', $o->fresh()->status);
        $this->assertSame(7, DB::table('inventory')->value('on_hand'));
        $this->assertSame(8, DB::table('notification_attempts')->count());
    }

    public function test_rollback_no_mail_and_after_commit_relay(): void
    {
        $o = $this->paid();
        $service = app(NotificationDelivery::class);
        $service->relay();
        $before = DB::table('notification_deliveries')->count();
        DB::beginTransaction();
        $o = $this->action($o, 'processing');
        $o = $this->action($o, 'create', $this->fields($o));
        $this->action($o, 'ship');
        try {
            $service->relay();
            $this->fail('Relay accepted an open domain transaction');
        } catch (\LogicException) {
        }
        DB::rollBack();
        $this->assertSame(0, $service->relay());
        $this->assertSame($before, DB::table('notification_deliveries')->count());
        $this->assertCount(0, Mail::mailer('array')->getSymfonyTransport()->messages());
    }

    public function test_account_snapshot_recipient_and_historical_amounts(): void
    {
        $u = $this->customer();
        $o = $this->paid($u);
        $u->forceFill(['email' => 'changed@example.test'])->save();
        $this->deliveries();
        $messages = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(2, $messages);
        foreach ($messages as $m) {
            $mail = $m->getOriginalMessage();
            $this->assertSame($o->contact_email, $mail->getTo()[0]->getAddress());
            $this->assertStringContainsString('/account/orders/'.$o->id, $mail->getHtmlBody());
            $this->assertStringContainsString('NGN 16.62', $mail->getTextBody());
            $this->assertStringNotContainsString('changed@example.test', $mail->getHtmlBody());
        }
        $created = $messages->first()->getOriginalMessage()->getHtmlBody();
        $this->assertStringContainsString('does not confirm payment', $created);
    }

    public function test_transient_permanent_and_ambiguous_failures_are_bounded(): void
    {
        $this->paid();
        $service = app(NotificationDelivery::class);
        $service->relay();
        $id = DB::table('notification_deliveries')->orderBy('id')->value('id');
        Mail::shouldReceive('mailer')->andThrow(new TransportException('Synthetic temporary rejection', 451));
        for ($i = 0; $i < 5; $i++) {
            $service->deliver($id);
            DB::table('notification_deliveries')->where('id', $id)->update(['next_attempt_at' => now()->subSecond()]);
        }
        $d = DB::table('notification_deliveries')->where('id', $id)->first();
        $this->assertSame('FAILED', $d->status);
        $this->assertSame(5, $d->attempts);
        $this->assertSame('ATTEMPTS_EXHAUSTED', $d->error_code);
        $other = DB::table('notification_deliveries')->where('id', '<>', $id)->value('id');
        Mail::swap(\Mockery::mock(MailManager::class)->shouldReceive('mailer')->andThrow(new TransportException('Synthetic lost reply'))->getMock());
        $service->deliver($other);
        $service->deliver($other);
        $this->assertSame('UNKNOWN', DB::table('notification_deliveries')->where('id', $other)->value('status'));
        $this->assertSame(1, DB::table('notification_deliveries')->where('id', $other)->value('attempts'));
        $this->assertSame(0, DB::table('notification_deliveries')->whereNotNull('sent_at')->count());
    }

    public function test_permanent_rejection_and_expired_worker_do_not_resend(): void
    {
        $this->paid();
        $service = app(NotificationDelivery::class);
        $service->relay();
        $rows = DB::table('notification_deliveries')->orderBy('id')->get();
        Mail::shouldReceive('mailer')->andThrow(new TransportException('Synthetic rejected recipient', 550));
        $service->deliver($rows[0]->id);
        $service->deliver($rows[0]->id);
        $this->assertSame('FAILED', DB::table('notification_deliveries')->where('id', $rows[0]->id)->value('status'));
        $this->assertSame(1, DB::table('notification_attempts')->count());
        DB::table('notification_deliveries')->where('id', $rows[1]->id)->update(['status' => 'SENDING', 'attempts' => 1, 'lease_token' => (string) Str::uuid(), 'lease_until' => now()->subMinute()]);
        DB::table('notification_attempts')->insert(['id' => (string) Str::uuid(), 'notification_delivery_id' => $rows[1]->id, 'attempt_number' => 1, 'status' => 'SENDING']);
        $service->recoverExpired();
        $service->deliver($rows[1]->id);
        $this->assertSame('UNKNOWN', DB::table('notification_deliveries')->where('id', $rows[1]->id)->value('status'));
    }

    public function test_concurrent_relays_and_workers_enforce_single_intent_and_attempt(): void
    {
        $this->paid();
        $counts = $this->race(fn () => (string) app(NotificationDelivery::class)->relay());
        $this->assertSame(2, array_sum(array_map('intval', $counts)));
        $id = DB::table('notification_deliveries')->value('id');
        $this->assertSame(['ok', 'ok'], $this->race(function () use ($id) {
            app(NotificationDelivery::class)->deliver($id);

            return 'ok';
        }));
        $this->assertSame(1, DB::table('notification_attempts')->count());
        $this->assertSame('SIMULATED', DB::table('notification_deliveries')->where('id', $id)->value('status'));
    }

    public function test_all_templates_escape_html_plaintext_and_validate_links(): void
    {
        $o = $this->delivered();
        $r = $this->received($this->requestReturn($o));
        $f = $this->refund($r);
        $token = $this->pending($f);
        app(RefundService::class)->finalize($f->id, $token, $this->observation($f), 'test');
        foreach (array_keys(NotificationContent::MATRIX) as $event) {
            $p = app(NotificationContent::class)->snapshot($event, $o->id, str_starts_with($event, 'Return') || str_starts_with($event, 'Refund') ? $r->id : null, now()->toIso8601String());
            $p['items'][0]['name'] = '<script>alert("test")</script> & basket';
            if (isset($p['return_items'])) {
                $p['return_items'][0]['name'] = $p['items'][0]['name'];
            }
            $mail = new TransactionalMail($p, (string) Str::uuid());
            $html = $mail->render();
            $this->assertStringNotContainsString('<script>', $html);
            $this->assertStringContainsString('&lt;script&gt;', $html);
            $this->assertStringContainsString('alt="IRANTI Africa"', $html);
            $this->assertStringContainsString(NotificationContent::MATRIX[$event][0], $html);
            [$heading, $messageText] = NotificationContent::MATRIX[$event];
            $plain = view('emails.transactional-text', ['content' => $p, 'heading' => $heading, 'messageText' => $messageText, 'orderUrl' => null])->render();
            $this->assertStringContainsString('<script>alert("test")</script> & basket', $plain);
            $this->assertStringNotContainsString('&lt;script&gt;', $plain);
        }
        $this->assertNull(NotificationContent::tracking('javascript:alert(1)'));
        $this->assertNull(NotificationContent::tracking('https://evil.example.test/parcel'));
        config(['communications.frontend_origin' => 'https://trusted.example.test@evil.example.test']);
        $this->expectException(\LogicException::class);
        NotificationContent::origin();
    }

    public function test_disabled_and_production_missing_configuration_fail_closed(): void
    {
        $this->paid();
        $service = app(NotificationDelivery::class);
        config(['communications.enabled' => false]);
        $this->assertSame(0, $service->relay());
        config(['communications.enabled' => true]);
        $service->relay();
        $d = DB::table('notification_deliveries')->first();
        $this->app->instance('env', 'production');
        config(['communications.frontend_origin' => 'https://shop.example.test', 'mail.default' => 'array']);
        $service->deliver($d->id);
        $this->assertSame('FAILED', DB::table('notification_deliveries')->where('id', $d->id)->value('status'));
        $this->assertSame('EXTERNAL_TRANSPORT_REQUIRED', DB::table('notification_deliveries')->where('id', $d->id)->value('error_code'));
        $this->app->instance('env', 'testing');
    }

    public function test_real_redis_worker_delivers_and_duplicate_job_is_noop(): void
    {
        $this->paid();
        app(NotificationDelivery::class)->relay();
        $id = DB::table('notification_deliveries')->value('id');
        Queue::swap($this->realQueue);
        $queue = 'notification-test-'.Str::uuid();
        try {
            for ($i = 0; $i < 2; $i++) {
                Queue::connection('redis')->push(new DeliverTransactionalEmail($id), '', $queue);
                Artisan::call('queue:work', ['connection' => 'redis', '--queue' => $queue, '--once' => true, '--tries' => 1, '--timeout' => 30]);
            }
            $this->assertSame('SIMULATED', DB::table('notification_deliveries')->where('id', $id)->value('status'));
            $this->assertSame(1, DB::table('notification_attempts')->count());
            $this->assertSame(0, DB::table('failed_jobs')->where('queue', $queue)->count());
            $this->assertCount(1, Mail::mailer('array')->getSymfonyTransport()->messages());
            Artisan::call('notifications:status');
            $this->assertStringContainsString('SIMULATED', Artisan::output());
            $this->assertStringNotContainsString('recipient_ciphertext', Artisan::output());
        } finally {
            Queue::connection('redis')->clear($queue);
        }
    }

    public function test_staging_requires_override_and_local_cannot_send_externally(): void
    {
        $o = $this->paid();
        $payload = app(NotificationContent::class)->snapshot('OrderCreated', $o->id, null, now()->toIso8601String());
        $transport = app(MailTransport::class);
        config(['mail.default' => 'smtp']);
        $this->assertSame('SIMULATED', $transport->send($o->contact_email, $payload, (string) Str::uuid())['status']);
        $this->app->instance('env', 'staging');
        config(['communications.frontend_origin' => 'https://shop.example.test', 'mail.from.address' => 'test@sender.test', 'mail.from.name' => 'Test Sender', 'mail.mailers.smtp.host' => 'smtp.sender.test', 'mail.mailers.smtp.scheme' => 'smtps', 'communications.staging_recipient' => null]);
        $this->assertSame('STAGING_RECIPIENT_REQUIRED', $transport->send($o->contact_email, $payload, (string) Str::uuid())['code']);
        config(['communications.staging_recipient' => 'sink@example.test']);
        Mail::shouldReceive('mailer')->once()->with('smtp')->andReturnSelf();
        Mail::shouldReceive('to')->once()->with('sink@example.test')->andReturnSelf();
        Mail::shouldReceive('send')->once()->andReturnNull();
        $this->assertSame('TRANSPORT_CANCELLED', $transport->send($o->contact_email, $payload, (string) Str::uuid())['code']);
        $this->app->instance('env', 'testing');
    }
}
