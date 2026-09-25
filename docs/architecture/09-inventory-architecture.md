# 09 — Inventory and reservation integrity
Trace: FR-INV-001–003, FR-PAY-003, NFR02/10; ADR-005.

For each variant: **available = on_hand − reserved**, all integer units, on_hand ≥ reserved ≥ 0. on_hand is physically saleable unsold stock; successful payment commits the sale, reducing on_hand and reserved equally. Shipment does not deduct again. Damaged/quarantined returned goods are never added to saleable on_hand.

## Phase 3D implementation amendment — 2026-09-23

[ADR-013 revision 2](adr/013-inventory-before-orders.md) is accepted and implemented. Current reservations are inventory-owned reference/generation/item records, without order/cart/payment dependencies. Internal methods implement atomic reserve/release/consume/expire; COMMITTED means consumed. A 900-second configurable engineering TTL and every-minute expiry command are implemented. Insufficient stock currently yields the internal 409 code INSUFFICIENT_STOCK; no public checkout contract is added. The order/payment workflow below remains future integration design, not functionality delivered in Phase 3D. See [the service contract](../development/inventory.md) and [executed concurrency results](../development/inventory-concurrency.md).

## Atomic workflow
1. Checkout validates authoritative prices/configuration, locks affected variant/config rows then inventory rows in sorted variant-ID order in a short PostgreSQL transaction.
2. For every requested item require available ≥ quantity. Failure rolls back the whole cart; no partial reservation.
3. Create order snapshots and an ACTIVE reservation generation; increment reserved and append RESERVE movement per item. Commit outbox OrderPlaced with the transaction.
4. Initialize provider payment outside the transaction. Temporary provider failure leaves a recoverable same-order payment state and reservation until its approved deadline.
5. Settlement locks order first, then relevant inventory rows sorted. Verify receipt/ref/order/amount/currency and reservation ownership. ACTIVE reservation becomes COMMITTED, on_hand and reserved decrease, SALE movements and PaymentApplied outbox commit once.
6. Expiry/cancellation locks order and the same stock rows. If still ACTIVE and due, decrement reserved only; mark EXPIRED/RELEASED and append RELEASE movements once.

Two customers purchasing the last unit serialize on its inventory row. First transaction reserves it; second sees available=0 and gets 409 OUT_OF_STOCK. Neither Redis locks nor cached availability authorize a sale. PostgreSQL checks are final defense. Deadlocks receive bounded transaction retry; long transactions alert operators. [PostgreSQL row-lock semantics](https://www.postgresql.org/docs/18/explicit-locking.html).

## Reservation transitions
| State / event | Effect | Restrictions |
|---|---|---|
| ACTIVE → COMMITTED | on_hand -= qty; reserved -= qty | Only verified payment application; once |
| ACTIVE → EXPIRED | reserved -= qty | Database clock ≥ expires_at; scheduler or checkout/settlement recovery |
| ACTIVE → RELEASED | reserved -= qty | Explicit eligible cancellation or approved terminal payment release |
| EXPIRED/RELEASED → new ACTIVE generation | Reserve all items again | Same order, one active generation; price snapshot unchanged; policy/stock still valid |
| COMMITTED | Terminal | No release; cancellation/return uses separate compensating movement |

A failed **attempt** does not necessarily cancel the order or immediately release its reservation: same-order retries remain supported. Timeout and absolute maximum extension require Q04/Q10 approval; repeated retries cannot reserve forever. Expiry worker is not sole authority: reservation validation uses expires_at at payment/retry time. Late success after expiry never consumes nonexistent reservation. Proposed safe exception: record receipt and PAYMENT_REVIEW; owner resolves allocation or refund using reviewed policy. Automatic reacquisition is not enabled without policy approval.

Administrative stock adjustments lock balance and append a delta with reason/actor, never overwrite counters. Reject any adjustment making on_hand < reserved; resolve affected reservations first under an approved workflow. Initial stock uses opening-balance movements. Replenishment invalidates public visibility; availability checks stay synchronous. Owner initially has write rights.

Return receipt does not automatically restock. After authorized inspection/disposition, add only approved saleable quantity with unique return-item operation key; refund and restock are independent. Sale cancellation can restore stock only if approved and goods have not already been restocked; cumulative checks prevent double restoration. Reconciliation compares balances and movement totals, alerts discrepancies and requires an audited correction; it never silently “fixes” money/stock.

Tests: parallel last-unit purchases, multi-item rollback, payment/expiry race, duplicate success, failed-attempt retry, stale Redis cache, two expiry workers, negative adjustment, duplicate restock and process death between DB commit and queue dispatch. These are future required tests, not executed claims.
