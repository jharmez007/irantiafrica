# ADR-017 — Committed commerce journals as notification sources

Date: 2026-09-24. Status: implemented for Phase 3K approval. Trace: architecture 08/21/24, FR-NOT-001, explicit Phase 3K authorization. Phase 3J implementation is approved; its provider/policy production gates remain.

## Context and decision

Approved order/payment/fulfilment/return services already commit durable domain journals atomically with their changes. Rewriting each service to additionally create a generic outbox would duplicate durability concerns and couple them to email selection. A relay reads those committed journals and atomically projects an immutable minimal `outbox_events` snapshot plus one `notification_deliveries` intent. Explicit real source FKs and per-source uniqueness replace a polymorphic aggregate-only link. Foreign keys restrict deletion; canonical source selection avoids mirrored order/fulfilment events producing duplicate email. No approved business state machine changes.

Domain transaction → committed journal → projected outbox/delivery transaction → after-commit Redis dispatch → fenced claim transaction → Laravel mail outside transactions → finalized attempt/delivery. A rolled-back domain event is never visible to this relay. Retrying a failed projection is safe, and a failed Redis dispatch leaves durable work. Existing domain services remain responsible for trustworthy journal emission. Source payloads use immutable order snapshots and finalized relevant quantities/amounts; no customer/staff notes are copied.

Logical deduplication is database-enforced; physical SMTP exactly-once is not promised. A 75-second sending lease, 30-second job timeout and 90-second Redis retry-after bound worker recovery. Explicit temporary rejection permits bounded retry; timeout/acceptance ambiguity or abandoned SENDING becomes UNKNOWN with no blind resend. Database failure evidence replaces repeated delivery retry for permanent/uncertain outcomes. SMTP-specific callback/suppression integration awaits provider selection and production verification.

## Consequences and scope

Add three tables in migration 014. The outbox is the email projection of existing journals, not a replacement for those journals. Delivery identity is immutable, attempt evidence retained, and rollout requires an explicit activation cutoff in staging/production to avoid accidental historical backfill. Operational alerts/retention and provider verification remain deployment tasks. Template matrix selects 12 meaningful email events under the client's express Phase 3K authority; processing noise, guest recovery and marketing stay deferred. Manual resend is not implemented. No Phase 3L work.
