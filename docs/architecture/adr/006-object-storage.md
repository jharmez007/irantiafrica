# ADR-006 — S3-compatible object storage

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Product images must survive deployment, serve efficiently and not expose arbitrary uploaded content.

## Decision
Private object storage originals/quarantine with validated public derivatives/CDN; metadata in PostgreSQL; immutable object keys, lifecycle cleanup and recovery testing.

## Alternatives Considered
Application filesystem is ephemeral and complicates scaling; binary images in primary DB bloat backup/serving; arbitrary external image URLs enable unsafe fetches.

## Consequences
Storage cost/access/backup/vendor compatibility must be confirmed. Media processing is asynchronous and bounded; image ownership/licensing remains client/developer assignment gap.

Detailed design: [23-media.md](../23-media.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
