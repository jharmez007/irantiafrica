<?php

namespace Tests\Infrastructure;

use App\Inventory\InventoryService;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

final class InventoryTest extends TestCase
{
    private array $jar = [];

    private const PASSWORD = 'Inventory-test-passphrase';

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated PostgreSQL and Redis.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        config(['session.driver' => 'database', 'session.secure' => false, 'session.encrypt' => true,
            'cors.allowed_origins' => ['http://localhost:3000'], 'sanctum.stateful' => ['localhost:3000'],
            'cache.prefix' => 'inventory-test-'.bin2hex(random_bytes(8)), 'hashing.bcrypt.rounds' => 4]);
        $this->app['hash']->forgetDrivers();
        $this->seed(IdentityPermissionsSeeder::class);
        Notification::fake();
        $this->browser('GET', '/sanctum/csrf-cookie')->assertNoContent();
    }

    private function browser(string $method, string $path, array $data = [], ?string $key = null, bool $csrf = true): TestResponse
    {
        // Requests represent independent HTTP requests, including a fresh guard/session lookup.
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('auth.driver');
        $this->app->forgetInstance('session.store');
        $this->app['session']->forgetDrivers();
        $server = ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => 'http://localhost:3000',
            'HTTP_REFERER' => 'http://localhost:3000/', 'CONTENT_TYPE' => 'application/json'];
        if ($csrf && isset($this->jar['XSRF-TOKEN'])) {
            $server['HTTP_X_XSRF_TOKEN'] = $this->jar['XSRF-TOKEN'];
        }
        if ($key !== null) {
            $server['HTTP_IDEMPOTENCY_KEY'] = $key;
        }
        $response = $this->call($method, $path, [], $this->jar, [], $server, json_encode($data, JSON_PRESERVE_ZERO_FRACTION));
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

    private function enroll(User $user): void
    {
        $this->login($user)->assertOk();
        $setup = $this->browser('POST', '/api/v1/auth/mfa/enroll')->assertOk()->json('data');
        $totp = new Google2FA;
        $this->browser('POST', '/api/v1/auth/mfa/confirm', ['code' => $totp->oathTotp($setup['secret'], $totp->getTimestamp() - 1)])->assertOk();
    }

    private function variant(string $name = 'Inventory fixture'): ProductVariant
    {
        $product = Product::factory()->create(['name' => $name]);

        return ProductVariant::create(['product_id' => $product->id, 'sku' => 'STOCK-'.strtoupper((string) Str::uuid()),
            'option_signature' => '', 'unit_price_minor' => '125000', 'status' => 'active'])->refresh();
    }

    private function initialize(User $owner, ProductVariant $variant, int $quantity = 10, ?string $key = null): InventoryMovement
    {
        return app(InventoryService::class)->initializeStock($variant->id, $quantity, 'Verified opening count', $key ?? (string) Str::uuid(), $owner);
    }

    private function stock(ProductVariant $variant): Inventory
    {
        return Inventory::where('variant_id', $variant->id)->firstOrFail();
    }

    private function conflict(callable $operation): void
    {
        try {
            $operation();
            $this->fail('The inventory operation must conflict.');
        } catch (HttpExceptionInterface $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }
    }

    public function test_opening_stock_is_atomic_audited_and_replayable_without_overwrite(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $key = (string) Str::uuid();
        $opening = $this->initialize($owner, $variant, 12, $key);
        $this->assertSame('OPENING', $opening->kind);
        $this->assertSame(12, $opening->on_hand_delta);
        $this->assertSame(0, $opening->reserved_delta);
        $this->assertSame($owner->id, $opening->actor_user_id);
        $this->assertSame(12, $this->stock($variant)->on_hand);
        $this->assertSame(0, $this->stock($variant)->reserved);
        $this->assertIsString($this->stock($variant)->version);
        $this->assertSame($opening->id, $this->initialize($owner, $variant, 12, $key)->id);
        $this->conflict(fn () => $this->initialize($owner, $variant, 13, $key));
        $this->conflict(fn () => $this->initialize($owner, $variant, 12));
        $this->assertSame(1, InventoryMovement::where('variant_id', $variant->id)->count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'like', 'inventory.%')->count());
        $this->assertSame(12, $this->stock($variant)->on_hand);
        // Phase 3G owns these tables; inventory operations must still create no orders.
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('payment_attempts', 0);
        $this->assertDatabaseCount('order_items', 0);
        foreach (['return_requests'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
    }

    public function test_adjustment_is_delta_based_with_versioned_exact_replay(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $this->initialize($owner, $variant);
        $originalVersion = $this->stock($variant)->version;
        $key = (string) Str::uuid();
        $service = app(InventoryService::class);
        $movement = $service->adjustStock($variant->id, -3, 'Damaged during count', $key, $owner, $originalVersion);
        $this->assertSame('ADJUSTMENT', $movement->kind);
        $this->assertSame(-3, $movement->on_hand_delta);
        $this->assertSame(7, $movement->on_hand_after);
        $this->assertSame(7, $this->stock($variant)->on_hand);
        $this->assertSame((string) ((int) $originalVersion + 1), $this->stock($variant)->version);
        // The original version is now stale, but an exact retry returns its committed movement.
        $this->assertSame($movement->id, $service->adjustStock($variant->id, -3, 'Damaged during count', $key, $owner, $originalVersion)->id);
        $this->conflict(fn () => $service->adjustStock($variant->id, -2, 'Damaged during count', $key, $owner, $originalVersion));
        $this->conflict(fn () => $service->adjustStock($variant->id, -3, 'Different reason', $key, $owner, $originalVersion));
        $this->conflict(fn () => $service->adjustStock($variant->id, -3, 'Damaged during count', $key, $owner, $this->stock($variant)->version));
        $this->conflict(fn () => $service->adjustStock($variant->id, 1, 'Stale stock view', (string) Str::uuid(), $owner, $originalVersion));
        $this->assertSame(2, InventoryMovement::where('variant_id', $variant->id)->count());
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'like', 'inventory.%')->count());
    }

    public function test_adjustment_cannot_remove_reserved_stock_underflow_or_overflow(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $this->initialize($owner, $variant);
        // Valid reserved-balance fixture; reservation lifecycle has its own integration tests.
        DB::table('inventory')->where('variant_id', $variant->id)->update(['reserved' => 7]);
        $service = app(InventoryService::class);
        $this->conflict(fn () => $service->adjustStock($variant->id, -4, 'Cannot remove a hold', (string) Str::uuid(), $owner, $this->stock($variant)->version));
        $service->adjustStock($variant->id, -3, 'Remove available units', (string) Str::uuid(), $owner, $this->stock($variant)->version);
        $this->assertSame(7, $this->stock($variant)->on_hand);
        $this->assertSame(7, $this->stock($variant)->reserved);
        $this->conflict(fn () => $service->adjustStock($variant->id, -2147483647, 'Underflow attempt', (string) Str::uuid(), $owner, $this->stock($variant)->version));
        $this->conflict(fn () => $service->adjustStock($variant->id, 2147483647, 'Overflow attempt', (string) Str::uuid(), $owner, $this->stock($variant)->version));
        $maximum = $this->variant();
        $this->initialize($owner, $maximum, 2147483647);
        $this->conflict(fn () => $service->adjustStock($maximum->id, 1, 'Overflow by one', (string) Str::uuid(), $owner, $this->stock($maximum)->version));
        $this->assertSame(2147483647, $this->stock($maximum)->on_hand);
    }

    public function test_domain_mutations_require_an_active_actor_with_inventory_adjust_permission(): void
    {
        $variant = $this->variant();
        $disabled = $this->staff();
        $disabled->forceFill(['status' => 'disabled'])->saveOrFail();
        foreach ([$this->staff('inventory_store'), $this->staff('order_processing'), User::factory()->create(['password' => self::PASSWORD]), $disabled] as $candidate) {
            try {
                $this->initialize($candidate, $variant);
                $this->fail('Unprivileged actor cannot initialize inventory.');
            } catch (HttpExceptionInterface $exception) {
                $this->assertSame(403, $exception->getStatusCode());
            }
        }
        $this->assertSame(0, DB::table('inventory')->count());
    }

    public function test_balance_movement_and_audit_roll_back_together_on_write_failures(): void
    {
        $owner = $this->staff();
        foreach (['inventory_movements', 'audit_logs'] as $table) {
            $variant = $this->variant();
            $existing = $this->variant();
            $this->initialize($owner, $existing, 8);
            $version = $this->stock($existing)->version;
            DB::unprepared("CREATE FUNCTION inventory_test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected inventory atomicity failure'; END; $$");
            DB::unprepared('CREATE TRIGGER inventory_test_failure BEFORE INSERT ON '.$table.' FOR EACH ROW EXECUTE FUNCTION inventory_test_fail_insert()');
            try {
                try {
                    $this->initialize($owner, $variant);
                    $this->fail('Injected write failure should propagate.');
                } catch (QueryException $exception) {
                    $this->assertSame('P0001', $exception->errorInfo[0]);
                }
                $this->assertSame(0, Inventory::where('variant_id', $variant->id)->count());
                $this->assertSame(0, InventoryMovement::where('variant_id', $variant->id)->count());
                try {
                    app(InventoryService::class)->adjustStock($existing->id, -2, 'Rollback existing stock', (string) Str::uuid(), $owner, $version);
                    $this->fail('An adjustment cannot commit without both history records.');
                } catch (QueryException $exception) {
                    $this->assertSame('P0001', $exception->errorInfo[0]);
                }
                $this->assertSame(8, $this->stock($existing)->on_hand);
                $this->assertSame($version, $this->stock($existing)->version);
                $this->assertSame(1, InventoryMovement::where('variant_id', $existing->id)->count());
            } finally {
                DB::unprepared('DROP TRIGGER inventory_test_failure ON '.$table);
                DB::unprepared('DROP FUNCTION inventory_test_fail_insert()');
            }
        }
    }

    public function test_database_balance_constraints_and_movement_immutability_are_enforced(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $movement = $this->initialize($owner, $variant);
        foreach (['on_hand = -1', 'reserved = -1', 'reserved = 11', 'low_stock_threshold = -1', 'version = 0'] as $assignment) {
            try {
                DB::transaction(fn () => DB::statement('UPDATE inventory SET '.$assignment));
                $this->fail('PostgreSQL must reject invalid stock.');
            } catch (QueryException $exception) {
                $this->assertSame('23514', $exception->errorInfo[0]);
            }
        }
        foreach (["UPDATE inventory_movements SET reason = 'Changed history'", 'DELETE FROM inventory_movements', 'TRUNCATE inventory_movements'] as $sql) {
            try {
                DB::transaction(fn () => DB::statement($sql));
                $this->fail('Historical stock movement must be immutable.');
            } catch (QueryException $exception) {
                $this->assertNotEmpty($exception->errorInfo[0]);
            }
        }
        $this->assertSame('Verified opening count', $movement->fresh()->reason);
        foreach (['DELETE FROM inventory', 'TRUNCATE inventory'] as $sql) {
            try {
                DB::transaction(fn () => DB::statement($sql));
                $this->fail('Stock balances must not disappear independently of their ledger.');
            } catch (QueryException $exception) {
                $this->assertNotEmpty($exception->errorInfo[0]);
            }
        }
        $duplicate = (array) DB::table('inventory_movements')->where('id', $movement->id)->first();
        $duplicate['id'] = (string) Str::uuid();
        try {
            DB::transaction(fn () => DB::table('inventory_movements')->insert($duplicate));
            $this->fail('Operation key must be unique.');
        } catch (QueryException $exception) {
            $this->assertSame('23505', $exception->errorInfo[0]);
        }
        foreach ([['on_hand_delta' => 0, 'reserved_delta' => 0], ['on_hand_after' => -1], ['reserved_after' => 11], ['kind' => 'UNAPPROVED']] as $invalid) {
            $row = array_replace($duplicate, $invalid, ['id' => (string) Str::uuid(), 'operation_key' => 'test-invalid-'.Str::uuid()]);
            try {
                DB::transaction(fn () => DB::table('inventory_movements')->insert($row));
                $this->fail('The database must reject invalid movement effects.');
            } catch (QueryException $exception) {
                $this->assertSame('23514', $exception->errorInfo[0]);
            }
        }
        $this->assertSame(1, InventoryMovement::count());
    }

    public function test_owner_api_initialization_adjustment_history_and_csrf(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $variant = $this->variant();
        $path = '/api/v1/admin/inventory/'.$variant->id;
        $this->browser('GET', $path)->assertOk()->assertJsonPath('data.initialized', false);
        $key = (string) Str::uuid();
        $opening = $this->browser('POST', $path.'/opening', ['quantity' => 8, 'reason' => 'Owner stock count'], $key)->assertSuccessful();
        $opening->assertJsonPath('data.on_hand', 8)->assertJsonPath('data.reserved', 0)->assertJsonPath('data.available_quantity', 8)->assertJsonPath('data.available', true);
        $this->browser('POST', $path.'/opening', ['quantity' => 8, 'reason' => 'Owner stock count'], $key)->assertSuccessful()->assertJsonPath('movement_id', $opening->json('movement_id'));
        $body = ['delta' => -2, 'reason' => 'Damaged packaging', 'expected_version' => $opening->json('data.version')];
        $key = (string) Str::uuid();
        $this->browser('POST', $path.'/adjustments', $body, $key, false)->assertStatus(419);
        $adjustment = $this->browser('POST', $path.'/adjustments', $body, $key)->assertSuccessful()->assertJsonPath('data.on_hand', 6);
        $this->browser('POST', $path.'/adjustments', $body, $key)->assertSuccessful()->assertJsonPath('movement_id', $adjustment->json('movement_id'));
        $history = $this->browser('GET', $path.'/movements')->assertOk()->assertJsonCount(2, 'data')->json('data');
        $this->assertSame($owner->id, $history[0]['actor']['id']);
        $this->assertSame($owner->name, $history[0]['actor']['name']);
        $this->assertArrayNotHasKey('email', $history[0]['actor']);
        $this->assertArrayNotHasKey('operation_key', $history[0]);
        foreach (['reference_id', 'reservation_item_id', 'reservation_id'] as $field) {
            $this->assertArrayNotHasKey($field, $history[0]);
        }
        $this->browser('GET', '/api/v1/admin/inventory/'.Str::uuid())->assertNotFound();
        $this->browser('GET', '/api/v1/admin/inventory/'.$owner->id)->assertNotFound();
        $this->browser('GET', '/api/v1/admin/inventory/not-a-uuid')->assertNotFound();
    }

    public function test_api_rejects_quantity_coercion_bad_keys_reason_and_mass_assignment(): void
    {
        $this->enroll($this->staff());
        $variant = $this->variant();
        $path = '/api/v1/admin/inventory/'.$variant->id;
        foreach ([0, -1, 2147483648, '1', '1e3', 1.0, 1.5, true, null] as $quantity) {
            $this->browser('POST', $path.'/opening', ['quantity' => $quantity, 'reason' => 'Invalid quantity'], (string) Str::uuid())->assertUnprocessable();
        }
        foreach ([null, 'not-a-uuid'] as $key) {
            $this->browser('POST', $path.'/opening', ['quantity' => 1, 'reason' => 'Invalid key'], $key)->assertUnprocessable();
        }
        foreach (['', '   ', str_repeat('x', 501)] as $reason) {
            $this->browser('POST', $path.'/opening', ['quantity' => 1, 'reason' => $reason], (string) Str::uuid())->assertUnprocessable();
        }
        foreach (['on_hand' => 100, 'reserved' => 3, 'available' => 99, 'actor_user_id' => (string) Str::uuid(), 'variant_id' => (string) Str::uuid()] as $field => $value) {
            $this->browser('POST', $path.'/opening', ['quantity' => 1, 'reason' => 'Injected field', $field => $value], (string) Str::uuid())->assertUnprocessable();
        }
        $opening = $this->browser('POST', $path.'/opening', ['quantity' => 2, 'reason' => 'Valid count'], (string) Str::uuid())->assertSuccessful();
        foreach ([0, -2147483648, 2147483648, '-1', 1.0, true, null] as $delta) {
            $this->browser('POST', $path.'/adjustments', ['delta' => $delta, 'reason' => 'Invalid delta', 'expected_version' => $opening->json('data.version')], (string) Str::uuid())->assertUnprocessable();
        }
        foreach ([null, 1, '0', '-1', '1.0', '1e2', '9223372036854775808'] as $version) {
            $this->browser('POST', $path.'/adjustments', ['delta' => 1, 'reason' => 'Invalid version', 'expected_version' => $version], (string) Str::uuid())->assertUnprocessable();
        }
        $this->assertSame(2, $this->stock($variant)->on_hand);
        $this->assertSame(1, InventoryMovement::count());
    }

    public function test_anonymous_customer_pending_mfa_and_staff_roles_have_exact_inventory_access(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $this->initialize($owner, $variant, 4);
        $path = '/api/v1/admin/inventory/'.$variant->id;
        $this->browser('GET', '/api/v1/admin/inventory')->assertUnauthorized();
        $this->browser('POST', $path.'/adjustments', ['delta' => 1, 'reason' => 'Denied', 'expected_version' => '1'], (string) Str::uuid())->assertUnauthorized();
        $this->login(User::factory()->create(['password' => self::PASSWORD]))->assertOk();
        $this->browser('GET', $path)->assertForbidden();
        $this->browser('GET', $path.'/movements')->assertForbidden();
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        $this->login($owner)->assertOk();
        $this->browser('GET', $path)->assertForbidden();
        $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        foreach (['inventory_store', 'order_processing'] as $role) {
            $this->enroll($this->staff($role));
            $read = $this->browser('GET', $path)->assertOk()->json('data');
            $list = $this->browser('GET', '/api/v1/admin/inventory')->assertOk()->json('data.0');
            if ($role === 'inventory_store') {
                $this->assertSame(4, $read['on_hand']);
                $this->assertSame(4, $read['available_quantity']);
                $history = $this->browser('GET', $path.'/movements')->assertOk()->json('data.0');
                $this->assertArrayNotHasKey('actor', $history);
                $this->assertArrayNotHasKey('actor_user_id', $history);
                $this->assertSame('Operational stock movement', $history['reason']);
                $this->assertStringNotContainsString($owner->name, json_encode($history));
                $this->assertStringNotContainsString($owner->email, json_encode($history));
            } else {
                foreach ([$read, $list] as $projection) {
                    foreach (['on_hand', 'reserved', 'available_quantity', 'initialized', 'version', 'low_stock_threshold', 'low_stock'] as $field) {
                        $this->assertArrayNotHasKey($field, $projection);
                    }
                    $this->assertIsBool($projection['available']);
                }
                $this->browser('GET', $path.'/movements')->assertForbidden();
            }
            $this->browser('POST', $path.'/opening', ['quantity' => 4, 'reason' => 'Denied'], (string) Str::uuid())->assertForbidden();
            $this->browser('POST', $path.'/adjustments', ['delta' => 1, 'reason' => 'Denied', 'expected_version' => '1'], (string) Str::uuid())->assertForbidden();
            $this->browser('POST', '/api/v1/auth/logout')->assertNoContent();
        }
        $this->assertSame(4, $this->stock($variant)->on_hand);
        $this->assertSame(1, InventoryMovement::count());
    }

    public function test_inventory_search_pagination_bounds_and_role_revocation(): void
    {
        $owner = $this->staff();
        $this->enroll($owner);
        $first = $this->variant('Amber basket');
        $second = $this->variant('Amber tray');
        $this->variant('Blue cloth');
        $this->initialize($owner, $first, 3);
        $this->initialize($owner, $second, 2);
        $this->browser('GET', '/api/v1/admin/inventory?q=Amber&per_page=1')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('meta.last_page', 2)->assertJsonPath('meta.per_page', 1);
        $this->browser('GET', '/api/v1/admin/inventory?q='.$first->sku)->assertOk()->assertJsonPath('meta.total', 1);
        $this->browser('GET', '/api/v1/admin/inventory?q=no-match')->assertOk()->assertJsonCount(0, 'data');
        foreach (['page=0', 'per_page=0', 'per_page=101', 'page=1e3', 'q='.str_repeat('a', 501)] as $query) {
            $this->browser('GET', '/api/v1/admin/inventory?'.$query)->assertUnprocessable();
        }
        $owner->roles()->detach();
        $this->browser('GET', '/api/v1/admin/inventory')->assertForbidden();
        $this->browser('POST', '/api/v1/admin/inventory/'.$first->id.'/adjustments', ['delta' => 1, 'reason' => 'Revoked', 'expected_version' => $this->stock($first)->version], (string) Str::uuid())->assertForbidden();
    }

    public function test_concurrent_opening_replays_create_exactly_one_balance_and_movement(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $key = (string) Str::uuid();
        $results = $this->race(fn () => $this->initialize($owner, $variant, 5, $key)->id);
        $this->assertSame($results[0], $results[1]);
        $this->assertTrue(Str::isUuid($results[0]));
        $this->assertSame(5, $this->stock($variant)->on_hand);
        $this->assertSame(1, Inventory::count());
        $this->assertSame(1, InventoryMovement::count());
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'like', 'inventory.%')->count());
    }

    public function test_concurrent_adjustment_replays_do_not_apply_delta_twice(): void
    {
        $owner = $this->staff();
        $variant = $this->variant();
        $this->initialize($owner, $variant, 5);
        $version = $this->stock($variant)->version;
        $key = (string) Str::uuid();
        $results = $this->race(fn () => app(InventoryService::class)->adjustStock($variant->id, -2, 'Concurrent count correction', $key, $owner, $version)->id);
        $this->assertSame($results[0], $results[1]);
        $this->assertTrue(Str::isUuid($results[0]));
        $this->assertSame(3, $this->stock($variant)->on_hand);
        $this->assertSame(2, InventoryMovement::count());
    }

    private function race(callable $operation): array
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Real PostgreSQL concurrency requires pcntl.');
        }
        $directory = sys_get_temp_dir().'/iranti-inventory-race-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        DB::disconnect();
        Redis::connection('default')->disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid === -1) {
                    $this->fail('Cannot fork inventory concurrency worker.');
                }
                if ($pid === 0) {
                    touch($directory.'/ready-'.$i);
                    $deadline = microtime(true) + 10;
                    while (! file_exists($directory.'/go') && microtime(true) < $deadline) {
                        usleep(10000);
                    }
                    try {
                        file_put_contents($directory.'/result-'.$i, $operation());
                        DB::disconnect();
                        exit(0);
                    } catch (\Throwable $exception) {
                        file_put_contents($directory.'/result-'.$i, $exception::class);
                        DB::disconnect();
                        exit(1);
                    }
                }
                $children[] = $pid;
            }
            $deadline = microtime(true) + 10;
            while ((! file_exists($directory.'/ready-0') || ! file_exists($directory.'/ready-1')) && microtime(true) < $deadline) {
                usleep(10000);
            }
            $this->assertFileExists($directory.'/ready-0');
            $this->assertFileExists($directory.'/ready-1');
            touch($directory.'/go');
            foreach ($children as $i => $pid) {
                pcntl_waitpid($pid, $status);
                $this->assertTrue(pcntl_wifexited($status));
                $this->assertSame(0, pcntl_wexitstatus($status), (string) @file_get_contents($directory.'/result-'.$i));
            }

            return [file_get_contents($directory.'/result-0'), file_get_contents($directory.'/result-1')];
        } finally {
            foreach (glob($directory.'/*') as $file) {
                unlink($file);
            }
            rmdir($directory);
        }
    }
}
