# ADR-008 — Sanctum session authentication

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
Browser-only storefront/admin and guest order access need secure revocation, CSRF defense and ownership enforcement.

## Decision
Laravel Sanctum first-party cookie session mode, PostgreSQL sessions, same-origin edge, server-side policies; scoped guest capabilities separate from account sessions. Recommend staff MFA and recent auth for refunds/grants.

## Alternatives Considered
Browser localStorage bearer JWT increases exposure/revocation complexity; duplicate Next authentication splits authority; order-number/email guest lookup is insufficient proof.

## Consequences
Careful CSRF/proxy/cookie/SSR handling and token-redaction tests required. MFA tooling compatibility and exact account/guest/role policy await review. No personal access tokens needed for V1 browser.

Detailed design: [16-authentication.md](../16-authentication.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
