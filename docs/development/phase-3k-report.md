# PHASE 3K TRANSACTIONAL NOTIFICATIONS REPORT

**Subsequent client decision — 2026-09-24:** Phase 3K formally APPROVED. External email delivery, sender/DNS authentication, bounce handling and real mailbox UAT remain production gates. Original readiness evidence below is retained; Phase 3L is separately authorized.

Implementation baseline **v1.0 — 2026-09-24**. Phase 3J implementation is formally approved, with its documented payment/refund provider and return-policy production gates preserved. Phase 3K adds email communications only. No Phase 3L work has begun.

| # | Required topic | Implementation / evidence |
| --- | --- | --- |
| 1 | Migrations | Additive migration 014 creates three notification tables and guards. Applied successfully to persistent `iranti_local` without reset/seeding. Repeated fresh migrations execute only in guarded `iranti_test` integration tests. |
| 2 | Persistence model | Immutable source/content outbox, unique versioned delivery with encrypted recipient and digest/mask, bounded attempts, fenced lease, timestamps, safe codes and provider Message-ID; finalized attempt history. No indefinitely stored rendered customer email. |
| 3 | Event-driven strategy | Project the existing durable order/payment/fulfilment/return journals; canonical source for each selected event. No direct SMTP or new notification calls inside commerce services. |
| 4 | After-commit behavior | Domain journal commits first; relay refuses ambient transactions, projects intent atomically, then queues after commit. Rolled-back events cannot produce messages. Delivery also refuses an ambient transaction. |
| 5 | Queue / retry | Redis `transactional`; launcher now consumes `identity,default,transactional`. Durable five-attempt transient-rejection limit and 60/300/900/3600-second backoffs; three infrastructure job retries. Permanent/ambiguous outcomes stop. |
| 6 | Idempotency | Unique source FK and event/template/recipient digest, locked claims, stable Message-ID and lease token. Concurrent relays/workers and repeated jobs tested. Physical SMTP exactly-once is not promised; UNKNOWN prevents blind resend. |
| 7 | Matrix | [Formal matrix](notification-matrix.md): 12 required commerce emails; existing Identity password reset retained; processing noise, attempt-failure email, verification not already enabled, guest recovery, resend and marketing deferred. |
| 8 | Templates | Twelve event subjects/messages in `NotificationContent::MATRIX`, shared branded HTML and text-only v1 renderer; code/version retained per delivery. |
| 9 | Guest recipient | Historical order contact. No account requirement, capability token, emailed guest link or access-lifetime renewal. Original browser access/support remains required. |
| 10 | Customer recipient | Same historical order snapshot even after account email changes. Account link is on the trusted frontend origin and remains protected by existing authentication/ownership. |
| 11 | Order mail | OrderCreated explicitly says payment is not yet confirmed; historical items/quantities/prices, separate taxes/delivery and total, date/reference and current-status guidance. |
| 12 | Payment mail | Applied verified PaymentSucceeded only; PaymentRequiresReview explicitly says do not pay again. Failure-attempt noise omitted; no provider payload or card data. |
| 13 | Fulfilment mail | Recorded dispatch and delivery only; historical carrier/tracking/date, HTTPS allowlisted URL rechecked at render; no internal packing notes or review marketing. |
| 14 | Return/refund mail | Request, approval/rejection, physical receipt, refund initiation/success/failure; exact historical quantities/amounts. No refund success without finalized success; existing disabled/unverified real-refund gate unchanged. |
| 15 | Branding | Supplied logo with original proportions; approved green/cream/charcoal, orange divider; email-safe fonts, simple responsive presentation layout. |
| 16 | Manual resend | Considered and deferred. No customer spam endpoint, new staff permission or unaudited bypass of terminal/UNKNOWN outcomes. |
| 17 | Operational visibility | Trusted CLI `notifications:status` exposes order/notification IDs, type, masked recipient, status, attempts, sent/failed time and safe code. No marketing dashboard or customer notification center. |
| 18 | Privacy/security | Laravel encrypted recipient; keyed digest; no secrets/internal notes/addresses/capabilities in content. Escaped HTML, text-only fallback, trusted-origin links. Local/test sink forced; staging commerce override required; production missing configuration fails closed. |
| 19 | Observability | Safe status/attempt/type/ID logs, durable failures and attempts, Laravel failed jobs for infrastructure exceptions; documented age/backlog/UNKNOWN monitoring. External alert routing remains deployment work. |
| 20 | Backend tests | Full PostgreSQL/Redis regression and notification-specific results recorded below. Rollback, historical recipient, all template renderers, duplicate/retry/concurrency, permanent/uncertain failures, safe modes, real Redis worker and status metadata tested. |
| 21 | Frontend/tests | No frontend source/UI change. Existing account route is linked. As an additional regression check, lint, formatting, TypeScript and all 158 tests in 17 files passed. Build outcome below. |
| 22 | Template QA | Chrome 48 template/width cases at 320/375/768/1440px: no overflow or distorted/broken logos. Four representative narrow/wide screenshots manually inspected. [Exact coverage and limits](email-templates.md). |
| 23 | Accessibility | No Axe WCAG A/AA violations in 48 cases; meaningful subjects, heading hierarchy, alt text, descriptive link, keyboard focus and plain-text alternative. Screen-reader/mail-client zoom/dark mode not claimed as tested. |
| 24 | External provider | **EXTERNAL EMAIL PROVIDER DELIVERY NOT VERIFIED**. In-memory transport and mock failures only; no real customer/provider mail sent. SENT means transport acceptance, not inbox delivery. |
| 25 | Dependency audits | Composer strict validation passed; Composer locked audit: no advisories. npm audit: zero vulnerabilities. No packages installed or lockfiles changed for Phase 3K. |
| 26 | Architecture refinement | [ADR-017](../architecture/adr/017-committed-notification-relay.md): consume existing transactional journals via real source FKs rather than modifying every domain transaction to insert a generic email outbox. Architecture 08/21 updated. |
| 27 | Production inputs | Sender/domain/reply-to/support ownership, provider credentials/dependencies if applicable, HTTPS origin, activation cutoff, staging recipient, SPF/DKIM/DMARC, real inbox tests, bounce/suppression monitoring, alerting/retention/key rotation. Existing Paystack/return-policy gates remain. |
| 28 | Readiness for Phase 3L | Phase 3K implementation is ready for client approval. Production activation is separately gated. Phase 3L is not started or automatically authorized. |

## Verification record

- Notification suite: 10 tests, including the final read-only CLI assertions in the full suite; includes a real uniquely named Redis queue, duplicate job no-op, and no external mail.
- Full backend regression: final run **190 tests / 4,743 assertions passed** after the SMTP URL guard and CLI metadata additions (PHP 8.5.8; 2m06s).
- Pint and Pint `--test`: passed. Larastan level 8: no errors.
- Composer strict validation and locked audit: passed, no advisories. npm audit: zero vulnerabilities.
- Frontend lint, Prettier, TypeScript and Vitest: passed (158 tests / 17 files). No frontend source was modified.
- Standard Turbopack production build: blocked by environment `Operation not permitted` when binding its worker socket, including an elevated retry. `npm run build -- --webpack` **passed**; no project configuration was changed for the fallback. Standard Turbopack remains an environment verification limitation, not a claimed pass.
- Additive migration on `iranti_local`: passed; local `notifications:status` safely returns an empty delivery table. Delivery enablement was not changed in the local environment.
- Launcher Python syntax and shell syntax: passed. No full launcher startup/shutdown was needed for its queue-list change.
- Chrome synthetic preview QA: 48 automated cases, zero overflow and Axe violations; manual screenshots detailed in [template guide](email-templates.md). Real email clients and inbox delivery remain unverified.

Evidence is ignored under `.runtime/notifications-verification/`. Existing repository state was preserved: most project files were already untracked, and frontend package manifest/lock changes predated this phase. No commit, deployment, package installation or real email send was performed.

## Notable implementation findings

Integration testing found and fixed PostgreSQL subsecond due-time comparison delaying immediate relay dispatch. Canonical source selection prevents mirrored order/fulfilment events creating duplicate shipment/delivery messages. The launcher previously consumed only the default queue; it now also consumes the existing identity and new transactional queues. SMTP URL overrides are rejected so validated discrete TLS settings cannot be bypassed. Unknown SMTP acceptance is deliberately held for investigation rather than blindly retried.

There is no asynchronous bounce callback/suppression adapter until provider selection. Known synchronous rejection is terminal; provider-side suppression/monitored bounces and real staging delivery are explicit production activation gates. `BOUNCED` is reserved schema vocabulary, not a claimed working callback. Existing Identity email behavior/templates are preserved, except that local/testing mail defaults to the safe in-memory sink; the commerce staging recipient override does not redirect Identity reset mail.

## Handoff

Temporary synthetic preview server, isolated Chrome and isolated PostgreSQL test service were stopped after verification. Existing native PostgreSQL/Redis and preexisting application processes were left running. The preexisting queue worker was observed still using `--queue=default`; restart the local launcher when convenient (`make stop` then `make dev`) to load `identity,default,transactional`. This phase did not interrupt that worker or enable outbound commerce email. Set local `TRANSACTIONAL_EMAIL_ENABLED=true` only if you want simulated lifecycle delivery.

Production activation still requires the external inputs and provider checks above. No visual or implementation blocker remains for review; real provider delivery, bounce handling and actual mail-client UAT are not claimed complete. Client approval of this phase is separate from production enablement and from authorization to start the next phase.

**PHASE 3K READY FOR APPROVAL**
