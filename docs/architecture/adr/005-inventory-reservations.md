# ADR-005 — PostgreSQL inventory reservations

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Client requires stock protection during payment, no overselling and same-order retry; expiry can race verified payment.

## Decision
Reserve in PostgreSQL with on_hand/reserved balance, append-only delta ledger and order reservation generations. Lock rows deterministically; successful settlement commits sale; expiry releases once.

## Alternatives Considered
Deduct only after unreserved payment can oversell; Redis-only locks/TTL lose durable capacity; decrement stock on cart selection enables hoarding and false promises.

## Consequences
Short lock transactions and expiry/reconciliation jobs are required. Late money may need owner resolution/refund. Timeout, mixed-variant visibility, restock and late-success policy need approval before affected implementation.

Detailed design: [09-inventory-architecture.md](../09-inventory-architecture.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
