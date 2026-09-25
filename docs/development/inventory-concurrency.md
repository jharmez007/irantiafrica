# Inventory concurrency strategy and verification

Phase 3D baseline v1.0 · 2026-09-23 · **Executed on PostgreSQL 18.6**, using independent forked PHP 8.5 processes and PDO connections. No SQLite substitution or sequential simulation was used for the race tests. [ADR-013 revision 2](../architecture/adr/013-inventory-before-orders.md) is accepted and implemented.

## Transaction and lock order

Manual opening/adjustment locks actor → variant → inventory. The variant lock serializes opening even before a balance exists. Exact operation replay checks the immutable audit hash before the stock version. Balance, movement and audit are one transaction.

Reserve inserts the durable inventory reference if absent using ON CONFLICT DO NOTHING, then locks reference → latest generation → distinct products in UUID order → variants in UUID order → balances in variant UUID order. It validates the entire canonical item set and fresh stock before writing. The reference lock serializes generation-one insertion and later retries. Products are locked before variants to agree with existing catalog mutations. No inventory table lock or catalog-wide advisory lock is taken by inventory.

Release/consume/expiry lock reference → generation → sorted balances. They do not subsequently acquire product locks. Every line commits together or none does. Current service entry points handle one reference per transaction; future orchestration owns outer order-first locking and whole-operation retries.

PostgreSQL `clock_timestamp()` is sampled after contested locks. Transaction-start `now()` cannot authorize consumption after a waiting caller crosses the deadline. A late consume closes/releases as EXPIRED and returns RESERVATION_NO_LONGER_ACTIVE after the successful transaction. Future outer callers must commit this outcome rather than undo it by throwing. A same-generation retry cannot extend a hold or create its successor.

## Retry policy and evidence

The service explicitly retries the whole top-level inventory transaction on PostgreSQL SQLSTATE **40001** or **40P01**, at most **three total attempts**, with 10–30ms jitter between attempts. Other failures propagate. Logs contain only SQLSTATE, attempt number and exhaustion flag—not SQL, payloads, secrets or customer details. No external side effect belongs inside retryable work.

A nested invocation executes once; the outer commerce caller must retry its complete transaction. Tests inject real PostgreSQL trigger errors and use a nontransactional sequence to count attempts: two 40001 failures then one successful commit produced exactly three attempts and one hold; persistent 40P01 stopped after three; an outer transaction received the failure after one inventory attempt and rolled back. These are deterministic PostgreSQL fault-injection tests, **not a claim that the production lock order generated a natural deadlock**.

## Executed PostgreSQL results

| Scenario | Result / asserted database observations |
|---|---|
| A — last unit | PASS: one ACTIVE reservation, one INSUFFICIENT_STOCK; on_hand=1, reserved=1; no losing generation persisted. |
| B — opposed multi-line requests | PASS: callers supplied opposite variant order; one complete two-line hold, one shortage; both balances reserved=1; no partial loser. |
| C — concurrent release | PASS: both receive RELEASED; one RELEASE movement; on_hand=5, reserved=0. |
| D — concurrent consume | PASS: both receive COMMITTED; one SALE movement; on_hand=4, reserved=0. |
| E — expiry versus consume | PASS on both sides of the deadline: before expiry COMMITTED with one SALE; after expiry EXPIRED with one RELEASE and rejected consume. No double effect. |
| F — adjustment versus reserve | PASS: only a permitted serialized result survives. Adjustment-first yields (0,0) and shortage; reserve-first yields (1,1) and stale-version rejection. Test asserts the observed branch and ledger/balance equality. |
| Concurrent identical reference | PASS: both return the same generation UUID; one hold and one reserve movement. |
| Release versus consume | PASS: one terminal winner and one RESERVATION_NO_LONGER_ACTIVE; exactly one closing movement. |
| Consumer waiting past deadline | PASS: inventory row held for three seconds; consumer started before its two-second deadline but returned expiry, preserving on_hand=1, reserved=0. |
| Product archival versus reserve | PASS: reserve waited behind the product lock and rejected the committed archive; no reservation or stock change. |
| Concurrent opening / adjustment replay | PASS: one opening balance/movement/audit; one adjustment effect; duplicate callers get the same movement UUID. |
| Changed item sets / generations | PASS: changed sets and skipped/active/committed successor requests rejected; old-generation retries do not affect a new hold. |
| Atomic failure | PASS: ledger failure rolls back reserve and close changes; audit/ledger failures roll back manual changes. |
| DB integrity | PASS: balance bounds, nonzero/type-correct movements, unique operations/generations/active reference, positive items, real and composite FKs, immutable history and terminal states. |

`ReservationTest` supplies the six mandatory races and additional reservation tests. Workers open independent connections before a common start barrier; lock/statement timeouts and parent deadlines bound the test, and only its own children/temp files are cleaned up. `InventoryTest` supplies manual/API/RBAC/MFA tests and two independent-process manual replay races. `CatalogAvailabilityTest` verifies real service changes through public API reads. Ledger sums and final balances are checked together in reservation tests.

The complete unfiltered backend run passed **93 tests / 1,781 assertions**, including migration fresh/reset/reapply, Redis queue/cache, identity and catalog regression. Four StockMath unit tests cover arithmetic. The initial full run caught a cached test-factory password hash at a different bcrypt cost; explicit inventory fixture passwords fixed test isolation without weakening authentication or changing its configuration.

## Reproduction and boundaries

Provision private `backend/.env.testing` for isolated loopback PostgreSQL **iranti_test** and the established test Redis configuration; never point these tests at iranti_local. Each database test checks testing environment/database before destructive setup. This run used the existing disposable cluster on port **54320**, separate from persistent development PostgreSQL on 5432.

```sh
cd backend
IRANTI_INFRA_TESTS=1 /opt/homebrew/bin/php vendor/bin/phpunit
# Focused repeat only when diagnosing an inventory change:
IRANTI_INFRA_TESTS=1 /opt/homebrew/bin/php vendor/bin/phpunit tests/Infrastructure/InventoryTest.php tests/Infrastructure/ReservationTest.php tests/Infrastructure/CatalogAvailabilityTest.php
```

These correctness tests are not a production capacity benchmark, a distributed failover exercise, or proof against privileged direct database writes. Production runtime permissions, scheduler monitoring and operational retention remain deployment responsibilities. No checkout/payment/order workflow or stock data for real customers was created.
