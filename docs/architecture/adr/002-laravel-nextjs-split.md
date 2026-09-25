# ADR-002 — Laravel + Next.js split

Date: 2026-09-20

## Status
PROPOSED — Phase 2 architecture approval pending. Technical recommendation only; associated client policy/configuration decisions remain in [open decisions](../31-open-architecture-decisions.md). No implementation authorization.

## Context
The project brief proposes Laravel and Next.js, with SEO, interactive shopping and restricted administration.

## Decision
Next.js App Router presents storefront/admin; Laravel owns authentication, authorization, pricing, inventory and business APIs. Same-origin edge routes API/auth to Laravel; SSR makes private scoped reads.

## Alternatives Considered
Laravel-only rendering is simpler but does not meet requested split; duplicating domain/auth in Next adds consistency and security risk.

## Consequences
Two runtimes/builds and careful cookie/cache handling; one business authority and explicit versioned API. No browser secret or authorization based solely on UI.

Detailed design: [04-container-architecture.md](../04-container-architecture.md). Revisit through an explicit ADR amendment/change request if approved requirements or measured constraints conflict.
