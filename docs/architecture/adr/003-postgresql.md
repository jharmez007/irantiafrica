# ADR-003 — PostgreSQL

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Financial snapshots, stock locks, referential integrity and exact operational reporting require transactional relational storage.

## Decision
Use supported PostgreSQL 18.x candidate, exact patched/provider version confirmed before lock; explicit constraints, deterministic row locking and PITR.

## Alternatives Considered
MySQL could work but is not selected stack; document database creates unnecessary integrity work; SQLite cannot validate production concurrency semantics.

## Consequences
Strong transactional controls; operations must manage connection limits, indexes, backup/restore and deadlocks. Cross-row business sums still need locked actions/tests.

Detailed design: [08-database-design.md](../08-database-design.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
