# Transactional notification operations

Phase 3K implementation v1 — 2026-09-24. [Matrix](notification-matrix.md), [templates](email-templates.md), [report](phase-3k-report.md), [ADR-017](../architecture/adr/017-committed-notification-relay.md).

## Persistence and commit safety

Migration `2026_09_24_000014_create_notification_delivery.php` adds `outbox_events`, `notification_deliveries`, `notification_attempts`. Existing commerce journals were already written atomically with business transactions. The minute relay reads only committed rows and projects minimal immutable content into an outbox and a delivery in one new transaction. It explicitly refuses an ambient transaction. Real source FKs, row locks and uniqueness fence competing relays; there is no timestamp high-water mark that could miss a late commit. No business service calls SMTP.

Each journal scan selects up to 100 unprojected selected events, with an optional activation cutoff. Outbox source/content and delivery identity are immutable; attempts are append/finalize records. Recipient ciphertext uses Laravel encryption; a keyed digest deduplicates it and a masked destination supports inspection. Historical order contact is used for both account holders and guests. No full rendered body is retained. Retention/erasure and encryption-key rotation must preserve this evidence via an approved maintenance migration; do not blindly delete these tables or discard old decryption keys.

After projection commits, the relay dispatches ID-only `DeliverTransactionalEmail` jobs through Redis on `transactional`, explicitly after commit. Redis failure leaves a durable PENDING row for the next relay. Duplicate dispatch is harmless at delivery claim, though a prolonged worker outage can accumulate duplicate queue messages. A successful dispatch records `queued_at`; `sent_at` only records transport acceptance, never simulation or inbox delivery.

## Local startup and safe mail

Apply additive migrations normally from `backend`:

```sh
/opt/homebrew/bin/php artisan migrate
```

Do not run `migrate:fresh` on `iranti_local`. Tests guard the separate `iranti_test` database.

The tracked defaults leave `TRANSACTIONAL_EMAIL_ENABLED=false`. Enable it in the **untracked local** environment to exercise automatic lifecycle delivery. Local and testing force the in-memory Laravel `array` mailer even if SMTP is configured. Delivery status is SIMULATED; it does not contact a provider or log email bodies. The ephemeral sink is not an inbox and worker exit discards its messages. Synthetic previews are the persistent development inspection tool.

```sh
# Repository root: starts the configured native services and app processes
make dev
# Equivalent worker/scheduler, from backend, if running manually
/opt/homebrew/bin/php artisan queue:work redis --queue=identity,default,transactional --sleep=1 --tries=3 --timeout=30
/opt/homebrew/bin/php artisan schedule:work
# Optional one relay pass and safe status inspection, from backend
/opt/homebrew/bin/php artisan notifications:relay
/opt/homebrew/bin/php artisan notifications:status --limit=30
/opt/homebrew/bin/php artisan queue:failed
```

The launcher now consumes `identity,default,transactional`, preserving default commerce work ahead of transactional email. Redis queue remains port 63790; cache remains 63791. Production should run separately supervised security, commerce and transactional workers to prevent starvation, with scheduler running once per minute. Existing PostgreSQL session storage is unchanged.

## Retry, ambiguity and operator response

Delivery claims commit SENDING + an attempt + a 75-second fenced lease before external I/O. Job timeout is 30 seconds; SMTP timeout 15; Redis retry-after remains 90. Laravel job infrastructure retries are bounded at three (backoff 60/300/900). Separately, known temporary SMTP 4xx rejection has at most five actual mail attempts, delayed 60/300/900/3600 seconds in durable delivery state. Never raise these values independently without reviewing their relationships.

| Status / code | Meaning and action |
| --- | --- |
| PENDING | Awaiting queue/known transient retry. Investigate age, scheduler, queue backlog and dispatch-unavailable warnings. |
| SENDING | Claimed; do not manually send. Relay fences leases that expire. |
| SIMULATED | Local/test sink only. No external delivery claim. |
| SENT | Configured transport accepted the message; **not** proof of inbox delivery. |
| FAILED / RECIPIENT_INVALID, PERMANENT_REJECTION | Invalid address or known SMTP 5xx rejection: no retry; investigate securely, never alter the historical order to redirect mail. |
| FAILED / configuration codes | Correct approved configuration; terminal intent does not automatically resend. Test configuration in staging before enabling production to avoid these failures. |
| FAILED / ATTEMPTS_EXHAUSTED | Five known transient attempts exhausted; alert/investigate. |
| UNKNOWN / TRANSPORT_OUTCOME_UNKNOWN or WORKER_OUTCOME_UNKNOWN | A timeout/crash may have followed acceptance. Query provider evidence using Message-ID before any approved recovery. No automatic retry or manual resend endpoint. |

Durable delivery/attempt rows are the mail failure queue equivalent; unexpected infrastructure job exceptions also use Laravel `failed_jobs`. `queue:retry` cannot bypass a terminal delivery or UNKNOWN guard. No ordinary staff/customer resend endpoint exists. Manual resend is deferred pending authorized recovery/audit semantics. Do not edit delivery status by SQL to bypass these safeguards.

`notifications:status` is a trusted developer/operator CLI, not a new Admin web permission. It shows notification/order IDs, template, masked recipient, status, attempts, sent/failed times and safe code. Join the delivery to `outbox_events` by FK for its order and event; inspect `failed_at`, `queued_at` and finalized attempts as needed. Never export recipient ciphertext or full snapshots into tickets/logs. Monitor safe `notification_delivery`, `notification_dispatch_unavailable`, `notification_job_failed` events, PENDING age, exhausted/UNKNOWN counts and worker/scheduler health. External alert routing is a deployment responsibility; no email-alert recursion is introduced.

## Staging and production activation

External delivery is **not verified**. No sender, provider account, credential or recipient has been invented. Laravel mail is the boundary; SMTP is usable with existing dependencies. SES/Postmark/Resend identifiers are permitted by the boundary but require their Laravel-compatible transport dependencies/configuration and separate verification before selection; none was installed. Existing Identity recovery remains its approved SMTP-only production path.

Required configuration, provided through deployment secrets/configuration:

- `APP_ENV=staging` or `production`; explicit HTTPS `FRONTEND_URL` (origin only, no path/query/userinfo).
- `TRANSACTIONAL_EMAIL_ENABLED=true` only after staging verification.
- Explicit `TRANSACTIONAL_EMAIL_START_AT` ISO-8601 UTC timestamp chosen for rollout, preventing unsolicited historical backfill. Test any intended backlog separately before choosing this boundary.
- Approved `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` and optional `MAIL_REPLY_TO_ADDRESS`. Placeholder example/invalid sender domains are rejected for commerce mail.
- For SMTP: `MAIL_MAILER=smtp`, `MAIL_SCHEME=smtps`, provider hostname, provider TLS port (typically 465), username/password via secrets. `MAIL_URL` should be unset; use the discrete validated fields. Local `.env.example` SMTP placeholders do not constitute production configuration. Implicit TLS is required by this implementation; an approved STARTTLS-only provider needs a separately verified configuration adjustment.
- Staging requires `MAIL_STAGING_RECIPIENT`, and **all new commerce mail** is redirected there. Historical intended recipient metadata stays on the intent; the override is not logged. This override does not alter the preexisting Identity password-reset flow: staging Identity must use synthetic test accounts only.
- Provider-approved sender domain, SPF/DKIM and DMARC setup; verified public frontend origin and logo asset; approved support channel and monitored Reply-to if used.

Production/staging array/log/failover modes fail closed for commerce email. An unknown environment fails closed. Local mail cannot be made live through MAIL_MAILER alone. Do not toggle a local database into production to test real delivery.

Known synchronous recipient rejection is terminal. Asynchronous bounce/complaint callbacks, recipient suppression and inbox delivery tracking are **not implemented or verified** without a selected provider. `BOUNCED` is reserved schema vocabulary, not a claimed working callback path. Before production activation, configure provider suppression and monitored bounce handling; if using application callbacks later, require verified signatures/replay protection and an approved adapter. A bounce must never cancel or refund an order. Provider outages with an ambiguous acceptance outcome stop at UNKNOWN rather than risking duplicate customer messages.

## Privacy and approved behavior

No marketing, unsubscribe database, guest email recovery, new customer notification center or commerce mutation. Snapshots contain necessary item/quantity/amount/reference data, not customer explanations, staff notes, full address, card/provider payload or credentials. HTML is escaped; plain-text output is intentionally literal in a text-only MIME part. Account links target the trusted existing `/account/orders/{uuid}` and require authentication/ownership. Guest mail contains no access link/token; original browser access remains governed by the approved absolute capability lifetime. Tracking links require HTTPS and the existing carrier host allowlist and are checked again before sending.

Payment confirmation requires an applied payment record; refund completion requires successful finalized refund state. Refund execution remains disabled by its existing gate until real Paystack UAT. Notification enablement cannot override payment/refund gates. Messages describe a historical event, with current order pages authoritative even if delivery is delayed/out of order.
