# ADR-001 — Modular monolith

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
The launch store needs reliable shared transactions for stock, orders and payments, with 20–50 initial products and no independently scaling business systems.

## Decision
One Laravel deployable with explicit module responsibilities and one PostgreSQL transaction boundary. Next remains a separate presentation runtime.

## Alternatives Considered
Microservices would introduce distributed consistency/operations without a requirement; an unstructured monolith would obscure ownership.

## Consequences
Simple atomic integrity and lower operational cost; module contracts and dependency review must prevent cross-module model writes. Extract services only on measured or approved need.

Detailed design: [02-modular-architecture.md](../02-modular-architecture.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
