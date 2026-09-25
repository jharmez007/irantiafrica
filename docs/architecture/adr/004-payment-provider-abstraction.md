# ADR-004 — Payment provider abstraction and durable effects

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Paystack is mandated initially; callbacks, retries, late/duplicate collections and uncertain refunds must not corrupt orders.

## Decision
Provider adapter normalizes initialize/verify/webhook/refund operations. Durable attempts/inbox/receipts and idempotent settlement apply one receipt/order; anomalies are held for review. Financial POST timeouts are reconciled before retry.

## Alternatives Considered
SDK calls embedded in Order couple business rules to provider; redirect-only confirmation is unsafe; claiming exactly-once network delivery is unsound.

## Consequences
Adapter/contract tests and operational reconciliation are necessary. At-least-once events achieve one logical business effect through unique keys, not guaranteed exactly-once transport. Merchant readiness and exception policy remain gates.

Detailed design: [12-payment-architecture.md](../12-payment-architecture.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
