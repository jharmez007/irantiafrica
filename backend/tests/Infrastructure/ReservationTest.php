<?php

namespace Tests\Infrastructure;

use App\Catalog\CatalogActions;
use App\Inventory\InventoryConflict;
use App\Inventory\InventoryService;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\Reservation;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\IdentityPermissionsSeeder;
use Illuminate\Database\DeadlockException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ReservationTest extends TestCase
{
    private User $owner;

    private InventoryService $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('IRANTI_INFRA_TESTS') !== '1') {
            $this->markTestSkipped('Requires isolated real PostgreSQL.');
        }
        $this->assertTrue($this->app->environment('testing'));
        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('iranti_test', config('database.connections.pgsql.database'));
        $this->assertContains(config('database.connections.pgsql.host'), ['127.0.0.1', 'localhost']);
        Artisan::call('migrate:fresh', ['--force' => true]);
        config(['hashing.bcrypt.rounds' => 4, 'inventory.reservation_ttl_seconds' => 900, 'cache.limiter' => 'array']);
        $this->app['hash']->forgetDrivers();
        $this->seed(IdentityPermissionsSeeder::class);
        $this->owner = User::factory()->create(['password' => 'Reservation-fixture-passphrase']);
        $this->owner->roles()->attach(Role::where('code', 'owner')->firstOrFail()->id, ['id' => (string) Str::uuid()]);
        $this->inventory = app(InventoryService::class);
    }

    private function variant(int $quantity = 5): ProductVariant
    {
        $product = Product::factory()->create(['status' => 'published', 'published_at' => now()]);
        $category = Category::create(['name' => 'Test category', 'slug' => 'test-'.Str::uuid(), 'status' => 'active']);
        $product->categories()->attach($category->id, ['id' => (string) Str::uuid()]);
        ProductMedia::create(['product_id' => $product->id, 'object_key' => 'test/'.Str::uuid(), 'status' => 'ready']);
        $variant = ProductVariant::create(['product_id' => $product->id, 'sku' => strtoupper((string) Str::uuid()), 'option_signature' => '', 'unit_price_minor' => '1000', 'status' => 'active']);
        $this->inventory->initializeStock($variant->id, $quantity, 'Opening fixture', (string) Str::uuid(), $this->owner);

        return $variant;
    }

    private function items(ProductVariant ...$variants): array
    {
        return array_map(fn ($v) => ['variant_id' => $v->id, 'quantity' => 1], $variants);
    }

    private function stock(ProductVariant $variant, int $hand, int $reserved): void
    {
        $stock = Inventory::where('variant_id', $variant->id)->firstOrFail();
        $this->assertSame($hand, $stock->on_hand);
        $this->assertSame($reserved, $stock->reserved);
        $totals = DB::table('inventory_movements')->where('variant_id', $variant->id)->selectRaw('sum(on_hand_delta) AS hand, sum(reserved_delta) AS reserved')->first();
        $this->assertSame($hand, (int) $totals->hand);
        $this->assertSame($reserved, (int) $totals->reserved);
    }

    private function conflict(callable $work, string $code): void
    {
        try {
            $work();
            $this->fail('Expected inventory conflict '.$code);
        } catch (InventoryConflict $e) {
            $this->assertSame($code, $e->inventoryCode);
        }
    }

    public function test_reference_replay_generations_terminal_states_and_complete_item_equality(): void
    {
        $a = $this->variant();
        $b = $this->variant();
        $ref = (string) Str::uuid();
        $r = $this->inventory->reserveMany($ref, $this->items($a, $b));
        $expiry = $r->expires_at->format('U.u');
        $this->assertSame($r->id, $this->inventory->reserveMany(strtoupper($ref), $this->items($b, $a))->id);
        $this->assertSame($expiry, $r->fresh()->expires_at->format('U.u'));
        $this->stock($a, 5, 1);
        $this->stock($b, 5, 1);
        $this->conflict(fn () => $this->inventory->reserveMany($ref, $this->items($a)), 'IDEMPOTENCY_CONFLICT');
        $this->conflict(fn () => $this->inventory->reserveMany($ref, $this->items($a, $b), 2), 'INVALID_RESERVATION_GENERATION');
        $this->assertSame('NOT_DUE', $this->inventory->expire($r->id)->code);
        $this->assertSame('RELEASED', $this->inventory->release($r->id)->code);
        $this->assertSame('RELEASED', $this->inventory->release($r->id)->code);
        $this->assertSame('RESERVATION_NO_LONGER_ACTIVE', $this->inventory->consume($r->id)->code);
        $this->assertSame('RELEASED', $this->inventory->reserveMany($ref, $this->items($a, $b))->status);
        $this->stock($a, 5, 0);
        $r2 = $this->inventory->reserveMany($ref, $this->items($a, $b), 2);
        $this->assertNotSame($r->id, $r2->id);
        $this->inventory->release($r->id); // Old retries cannot release the new generation.
        $this->stock($a, 5, 1);
        $this->assertSame('COMMITTED', $this->inventory->consume($r2->id)->code);
        $this->assertSame('COMMITTED', $this->inventory->consume($r2->id)->code);
        $this->assertSame('RESERVATION_NO_LONGER_ACTIVE', $this->inventory->release($r2->id)->code);
        $this->conflict(fn () => $this->inventory->reserveMany($ref, $this->items($a, $b), 3), 'INVALID_RESERVATION_GENERATION');
        $this->stock($a, 4, 0);
        $this->stock($b, 4, 0);
        $this->assertSame(2, Reservation::count());
        $this->assertSame(4, DB::table('reservation_items')->count());
        $this->assertSame(10, InventoryMovement::count());
    }

    public function test_late_consume_commits_expiry_and_scheduler_retries_are_safe(): void
    {
        config(['inventory.reservation_ttl_seconds' => 1]);
        $a = $this->variant();
        $ref = (string) Str::uuid();
        $r = $this->inventory->reserveMany($ref, $this->items($a));
        usleep(1100000);
        $outcome = $this->inventory->consume($r->id);
        $this->assertSame('RESERVATION_NO_LONGER_ACTIVE', $outcome->code);
        $this->assertSame('EXPIRED', $r->fresh()->status);
        $this->assertSame('EXPIRED', $this->inventory->expire($r->id)->code);
        $this->stock($a, 5, 0);
        $r2 = $this->inventory->reserveMany($ref, $this->items($a), 2);
        usleep(1100000);
        $this->artisan('inventory:expire-reservations')->assertSuccessful();
        $this->artisan('inventory:expire-reservations')->assertSuccessful();
        $this->artisan('inventory:expire-reservations', ['--limit' => '0'])->assertExitCode(2);
        $this->assertSame('EXPIRED', $r2->fresh()->status);
        $this->stock($a, 5, 0);
        $this->assertSame(5, InventoryMovement::count());
    }

    public function test_input_validation_eligibility_and_all_or_nothing_shortage(): void
    {
        $a = $this->variant();
        $b = $this->variant();
        foreach ([[], $this->items($a, $a), [['variant_id' => $a->id, 'quantity' => 0]], [['variant_id' => $a->id, 'quantity' => '1']], [['variant_id' => $a->id, 'quantity' => 1.0]]] as $items) {
            try {
                $this->inventory->reserveMany((string) Str::uuid(), $items);
                $this->fail('Invalid quantities must fail');
            } catch (\InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
        $this->conflict(fn () => $this->inventory->reserveMany((string) Str::uuid(), [['variant_id' => $a->id, 'quantity' => 1], ['variant_id' => $b->id, 'quantity' => 6]]), 'INSUFFICIENT_STOCK');
        foreach (['draft', 'archived'] as $status) {
            Product::whereKey($a->product_id)->update(['status' => $status]);
            $this->conflict(fn () => $this->inventory->reserveMany((string) Str::uuid(), $this->items($a, $b)), 'VARIANT_UNAVAILABLE');
        }
        Product::whereKey($a->product_id)->update(['status' => 'published']);
        $a->update(['status' => 'archived']);
        $this->conflict(fn () => $this->inventory->reserveMany((string) Str::uuid(), $this->items($a)), 'VARIANT_UNAVAILABLE');
        $this->stock($a, 5, 0);
        $this->stock($b, 5, 0);
        $this->assertSame(0, DB::table('reservation_references')->count());
        $this->assertSame(0, Reservation::count());
        $this->assertSame(0, DB::table('reservation_items')->count());
    }

    public function test_reservation_and_transition_roll_back_on_ledger_failure(): void
    {
        $a = $this->variant();
        $b = $this->variant();
        $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
        DB::unprepared("CREATE OR REPLACE FUNCTION fail_reservation_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected ledger failure'; END; $$; CREATE TRIGGER fail_reservation_test BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION fail_reservation_test()");
        try {
            foreach ([fn () => $this->inventory->reserveMany((string) Str::uuid(), $this->items($a, $b)), fn () => $this->inventory->consume($r->id), fn () => $this->inventory->release($r->id)] as $work) {
                try {
                    $work();
                    $this->fail('Failure must propagate');
                } catch (QueryException $e) {
                    $this->assertSame('P0001', $e->errorInfo[0]);
                }
                $this->stock($a, 5, 1);
                $this->stock($b, 5, 0);
                $this->assertSame('ACTIVE', $r->fresh()->status);
                $this->assertSame(1, Reservation::count());
                $this->assertSame(1, DB::table('reservation_items')->count());
                $this->assertSame(1, DB::table('reservation_references')->count());
            }
        } finally {
            DB::unprepared('DROP TRIGGER fail_reservation_test ON inventory_movements; DROP FUNCTION fail_reservation_test()');
        }
    }

    public function test_database_reference_foreign_keys_uniqueness_and_immutability(): void
    {
        $a = $this->variant();
        $b = $this->variant();
        $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
        $item = (array) DB::table('reservation_items')->first();
        $movement = (array) DB::table('inventory_movements')->where('kind', 'RESERVE')->first();
        $invalid = [
            [fn () => DB::table('reservation_items')->insert(array_replace($item, ['id' => (string) Str::uuid()])), '23505'],
            [fn () => DB::table('reservation_items')->insert(array_replace($item, ['id' => (string) Str::uuid(), 'variant_id' => $b->id, 'quantity' => 0])), '23514'],
            [fn () => DB::table('reservation_items')->insert(array_replace($item, ['id' => (string) Str::uuid(), 'reservation_id' => (string) Str::uuid()])), '23503'],
            [fn () => DB::table('inventory_movements')->insert(array_replace($movement, ['id' => (string) Str::uuid(), 'operation_key' => (string) Str::uuid(), 'variant_id' => $b->id])), '23503'],
            [fn () => DB::table('inventory_movements')->insert(array_replace($movement, ['id' => (string) Str::uuid()])), '23505'],
            [fn () => DB::table('reservations')->insert(['id' => (string) Str::uuid(), 'reference_id' => $r->reference_id, 'generation' => 2, 'status' => 'ACTIVE', 'expires_at' => now()->addHour()]), '23505'],
            [fn () => DB::table('reservations')->insert(['id' => (string) Str::uuid(), 'reference_id' => (string) Str::uuid(), 'generation' => 1, 'status' => 'ACTIVE', 'expires_at' => now()->addHour()]), '23503'],
        ];
        foreach ($invalid as [$work, $state]) {
            try {
                DB::transaction($work);
                $this->fail('Invalid inventory relation must fail');
            } catch (QueryException $e) {
                $this->assertSame($state, $e->errorInfo[0]);
            }
        }
        $this->inventory->release($r->id);
        foreach (["UPDATE reservations SET status = 'ACTIVE', closed_at = NULL", "UPDATE reservations SET expires_at = expires_at + interval '1 hour'", 'DELETE FROM reservations', 'TRUNCATE reservations CASCADE', 'UPDATE reservation_items SET quantity = 2', 'DELETE FROM reservation_items', 'TRUNCATE reservation_items CASCADE', 'UPDATE reservation_references SET created_at = now()', 'DELETE FROM reservation_references', 'TRUNCATE reservation_references CASCADE'] as $sql) {
            try {
                DB::transaction(fn () => DB::statement($sql));
                $this->fail('History must be immutable');
            } catch (QueryException $e) {
                $this->assertSame('P0001', $e->errorInfo[0]);
            }
        }
        $this->stock($a, 5, 0);
    }

    public function test_a_last_unit_race_allows_exactly_one_reservation(): void
    {
        $a = $this->variant(1);
        $result = $this->race(fn () => $this->inventory->reserveMany((string) Str::uuid(), $this->items($a))->status);
        sort($result);
        $this->assertSame(['ACTIVE', 'INSUFFICIENT_STOCK'], $result);
        $this->stock($a, 1, 1);
        $this->assertSame(1, Reservation::count());
    }

    public function test_b_opposed_multi_line_race_has_no_partial_reservation(): void
    {
        $a = $this->variant(1);
        $b = $this->variant(1);
        $result = $this->race(fn ($i) => $this->inventory->reserveMany((string) Str::uuid(), $i === 0 ? $this->items($a, $b) : $this->items($b, $a))->status);
        sort($result);
        $this->assertSame(['ACTIVE', 'INSUFFICIENT_STOCK'], $result);
        $this->stock($a, 1, 1);
        $this->stock($b, 1, 1);
        $this->assertSame(1, Reservation::count());
        $this->assertSame(2, DB::table('reservation_items')->count());
    }

    public function test_c_double_release_releases_exactly_once(): void
    {
        $a = $this->variant();
        $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
        $this->assertSame(['RELEASED', 'RELEASED'], $this->race(fn () => $this->inventory->release($r->id)->code));
        $this->stock($a, 5, 0);
        $this->assertSame(1, InventoryMovement::where('kind', 'RELEASE')->count());
    }

    public function test_d_double_consume_deducts_exactly_once(): void
    {
        $a = $this->variant();
        $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
        $this->assertSame(['COMMITTED', 'COMMITTED'], $this->race(fn () => $this->inventory->consume($r->id)->code));
        $this->stock($a, 4, 0);
        $this->assertSame(1, InventoryMovement::where('kind', 'SALE')->count());
    }

    public function test_e_expiry_versus_consume_has_one_valid_terminal_outcome(): void
    {
        foreach ([false, true] as $due) {
            config(['inventory.reservation_ttl_seconds' => $due ? 1 : 900]);
            $a = $this->variant();
            $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
            if ($due) {
                usleep(1100000);
            }
            $outcomes = $this->race(fn ($i) => $i === 0 ? $this->inventory->expire($r->id)->code : $this->inventory->consume($r->id)->code);
            $this->assertSame($due ? 'EXPIRED' : 'COMMITTED', $r->fresh()->status);
            $this->assertSame($due ? 'RESERVATION_NO_LONGER_ACTIVE' : 'COMMITTED', $outcomes[1]);
            $this->assertContains($outcomes[0], $due ? ['EXPIRED'] : ['NOT_DUE', 'RESERVATION_NO_LONGER_ACTIVE']);
            $this->stock($a, $due ? 5 : 4, 0);
            $this->assertSame(1, InventoryMovement::where('variant_id', $a->id)->whereIn('kind', ['SALE', 'RELEASE'])->count());
        }
    }

    public function test_f_adjustment_versus_reservation_preserves_invariants(): void
    {
        $a = $this->variant(1);
        $version = Inventory::where('variant_id', $a->id)->firstOrFail()->version;
        $key = (string) Str::uuid();
        $outcomes = $this->race(fn ($i) => $i === 0 ? $this->inventory->adjustStock($a->id, -1, 'Count correction', $key, $this->owner, $version)->kind : $this->inventory->reserveMany((string) Str::uuid(), $this->items($a))->status);
        $stock = Inventory::where('variant_id', $a->id)->firstOrFail();
        if ($outcomes[0] === 'ADJUSTMENT') {
            $this->assertSame('INSUFFICIENT_STOCK', $outcomes[1]);
            $this->stock($a, 0, 0);
        } else {
            $this->assertSame(['INVENTORY_VERSION_CONFLICT', 'ACTIVE'], $outcomes);
            $this->stock($a, 1, 1);
        }
        $this->assertGreaterThanOrEqual(0, $stock->available());
    }

    public function test_simultaneous_same_reference_replays_one_generation(): void
    {
        $a = $this->variant(1);
        $ref = (string) Str::uuid();
        $results = $this->race(fn () => $this->inventory->reserveMany($ref, $this->items($a))->id);
        $this->assertSame($results[0], $results[1]);
        $this->assertTrue(Str::isUuid($results[0]));
        $this->assertSame(1, Reservation::count());
        $this->stock($a, 1, 1);
    }

    public function test_consume_rechecks_deadline_after_waiting_for_inventory_lock(): void
    {
        config(['inventory.reservation_ttl_seconds' => 2]);
        $a = $this->variant(1);
        $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
        $results = $this->race(function ($i, $dir) use ($a, $r) {
            if ($i === 0) {
                return DB::transaction(function () use ($a, $dir) {
                    Inventory::where('variant_id', $a->id)->lockForUpdate()->firstOrFail();
                    touch($dir.'/locked');
                    usleep(3000000);

                    return 'UNLOCKED';
                });
            }
            $deadline = microtime(true) + 5;
            while (! file_exists($dir.'/locked') && microtime(true) < $deadline) {
                usleep(1000);
            }
            if (! file_exists($dir.'/locked') || $r->expires_at->isPast()) {
                throw new \RuntimeException('Test must start consume before expiry while lock held');
            }

            return $this->inventory->consume($r->id)->code;
        });
        $this->assertSame(['UNLOCKED', 'RESERVATION_NO_LONGER_ACTIVE'], $results);
        $this->assertSame('EXPIRED', $r->fresh()->status);
        $this->stock($a, 1, 0);
    }

    public function test_release_versus_consume_has_one_terminal_effect(): void
    {
        $a = $this->variant();
        $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
        $outcomes = $this->race(fn ($i) => $i === 0 ? $this->inventory->release($r->id)->code : $this->inventory->consume($r->id)->code);
        $terminal = $r->fresh()->status;
        $this->assertContains($terminal, ['RELEASED', 'COMMITTED']);
        $this->assertContains('RESERVATION_NO_LONGER_ACTIVE', $outcomes);
        $this->stock($a, $terminal === 'COMMITTED' ? 4 : 5, 0);
        $this->assertSame(1, InventoryMovement::whereIn('kind', ['SALE', 'RELEASE'])->count());
    }

    public function test_reserve_waits_for_product_archival_and_rejects_ineligible_stock(): void
    {
        $a = $this->variant();
        $outcomes = $this->race(function ($i, $dir) use ($a) {
            if ($i === 0) {
                return DB::transaction(function () use ($a, $dir) {
                    Product::lockForUpdate()->findOrFail($a->product_id);
                    touch($dir.'/locked');
                    usleep(200000);

                    return app(CatalogActions::class)->transition($a->product_id, 1, true)->status;
                });
            }
            $deadline = microtime(true) + 5;
            while (! file_exists($dir.'/locked') && microtime(true) < $deadline) {
                usleep(1000);
            }
            if (! file_exists($dir.'/locked')) {
                throw new \RuntimeException('Missing archive lock');
            }

            return $this->inventory->reserveMany((string) Str::uuid(), $this->items($a))->status;
        });
        $this->assertSame(['archived', 'VARIANT_UNAVAILABLE'], $outcomes);
        $this->stock($a, 5, 0);
        $this->assertSame(0, Reservation::count());
    }

    public function test_bounded_postgres_concurrency_retries_and_outer_transaction_contract(): void
    {
        $a = $this->variant();
        Log::spy();
        DB::unprepared("CREATE SEQUENCE inventory_retry_test; CREATE OR REPLACE FUNCTION inventory_retry_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('inventory_retry_test') < 3 THEN RAISE EXCEPTION 'Injected serialization failure' USING ERRCODE = '40001'; END IF; RETURN NEW; END; $$; CREATE TRIGGER inventory_retry_test BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION inventory_retry_test()");
        try {
            $r = $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
            $this->assertSame('ACTIVE', $r->status);
            $this->assertSame(3, DB::selectOne('SELECT last_value FROM inventory_retry_test')->last_value);
            $this->stock($a, 5, 1);
            Log::shouldHaveReceived('warning')->twice();
            DB::unprepared("CREATE OR REPLACE FUNCTION inventory_retry_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('inventory_retry_test'); RAISE EXCEPTION 'deadlock detected (injected)' USING ERRCODE = '40P01'; END; $$");
            try {
                $this->inventory->reserveMany((string) Str::uuid(), $this->items($a));
                $this->fail('Retry exhaustion must propagate');
            } catch (QueryException $e) {
                $this->assertSame('40P01', $e->errorInfo[0]);
            }
            $this->assertSame(6, DB::selectOne('SELECT last_value FROM inventory_retry_test')->last_value);
            try {
                DB::transaction(fn () => $this->inventory->reserveMany((string) Str::uuid(), $this->items($a)));
                $this->fail('Outer caller must retry entire transaction');
            } catch (\Throwable $e) {
                $this->assertInstanceOf(DeadlockException::class, $e);
            }
            $this->assertSame(7, DB::selectOne('SELECT last_value FROM inventory_retry_test')->last_value);
            $this->assertSame(0, DB::transactionLevel());
            $this->assertSame(1, Reservation::count());
            $this->stock($a, 5, 1);
        } finally {
            DB::unprepared('DROP TRIGGER inventory_retry_test ON reservations; DROP FUNCTION inventory_retry_test(); DROP SEQUENCE inventory_retry_test');
        }
    }

    /** Independent child processes/PDO connections, a common start barrier and bounded cleanup. */
    private function race(callable $work): array
    {
        $this->assertTrue(function_exists('pcntl_fork'), 'Mandatory real concurrency requires pcntl');
        $dir = sys_get_temp_dir().'/iranti-reservation-race-'.bin2hex(random_bytes(8));
        mkdir($dir, 0700);
        DB::disconnect();
        $children = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $pid = pcntl_fork();
                if ($pid === -1) {
                    throw new \RuntimeException('Cannot fork');
                }
                if ($pid === 0) {
                    try {
                        DB::statement("SET statement_timeout = '10s'");
                        DB::statement("SET lock_timeout = '8s'");
                        touch($dir.'/ready-'.$i);
                        $deadline = microtime(true) + 10;
                        while (! file_exists($dir.'/go') && microtime(true) < $deadline) {
                            usleep(1000);
                        }
                        if (! file_exists($dir.'/go')) {
                            throw new \RuntimeException('Missing start barrier');
                        }
                        try {
                            $result = $work($i, $dir);
                        } catch (InventoryConflict $e) {
                            $result = $e->inventoryCode;
                        }
                        file_put_contents($dir.'/result-'.$i, $result);
                        DB::disconnect();
                        exit(0);
                    } catch (\Throwable $e) {
                        file_put_contents($dir.'/result-'.$i, $e::class.': '.$e->getMessage());
                        DB::disconnect();
                        exit(1);
                    }
                }
                $children[$i] = $pid;
            }
            $deadline = microtime(true) + 15;
            while ((! file_exists($dir.'/ready-0') || ! file_exists($dir.'/ready-1')) && microtime(true) < $deadline) {
                usleep(1000);
            }
            $this->assertFileExists($dir.'/ready-0');
            $this->assertFileExists($dir.'/ready-1');
            touch($dir.'/go');
            foreach ($children as $i => $pid) {
                while (pcntl_waitpid($pid, $status, WNOHANG) === 0) {
                    if (microtime(true) > $deadline) {
                        throw new \RuntimeException('Concurrency worker timed out');
                    }
                    usleep(10000);
                }
                unset($children[$i]);
                $this->assertTrue(pcntl_wifexited($status));
                $this->assertSame(0, pcntl_wexitstatus($status), (string) @file_get_contents($dir.'/result-'.$i));
            }

            return [file_get_contents($dir.'/result-0'), file_get_contents($dir.'/result-1')];
        } finally {
            foreach ($children as $pid) {
                posix_kill($pid, SIGKILL);
                pcntl_waitpid($pid, $status);
            }
            foreach (glob($dir.'/*') as $file) {
                unlink($file);
            }
            rmdir($dir);
        }
    }
}
