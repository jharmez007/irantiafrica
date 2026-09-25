# ADR-009 — Managed application platform operating model

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Professional deployment needs Next/PHP, persistent workers/scheduler, PostgreSQL recovery, Redis and storage without hyperscale operations.

## Decision
Recommend managed application/container services with managed PostgreSQL/Redis, object storage/CDN and private networking; one region initially, sized by measured load. Vendor/budget/availability tier not selected.

## Alternatives Considered
Managed VPS is viable with named operator; general cloud infrastructure is viable for experienced team but heavier; shared hosting and Kubernetes are not defaults.

## Consequences
Operational cost and provider version/features must be verified; single-instance availability risk cannot be hidden. Named support/incident/recovery owners and restore evidence required before launch.

Detailed design: [27-deployment-architecture.md](../27-deployment-architecture.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
