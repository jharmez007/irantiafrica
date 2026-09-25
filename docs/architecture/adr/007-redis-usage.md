# ADR-007 — Bounded Redis and durable outbox

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Queues, rate limits and selective public cache help the store, but cache/transport failure must not lose orders, stock or payment effects.

## Decision
Redis supports queue transport/rate limiting/cache; PostgreSQL owns sessions/reservations/inbox/outbox/idempotency. Separate non-evicting queue and evictable cache services preferred. Durable work can be replayed idempotently.

## Alternatives Considered
Redis as financial/reservation authority risks loss; database queue alone is simpler but chosen stack supports separate worker workloads; caching all personalized responses is unsafe.

## Consequences
Additional service and memory monitoring; DB-outbox relay can deliver twice. Consumers deduplicate. External mail/payment outcomes can be uncertain and require provider-supported reconciliation; no false exactly-once claim.

Detailed design: [24-cache-queue.md](../24-cache-queue.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
