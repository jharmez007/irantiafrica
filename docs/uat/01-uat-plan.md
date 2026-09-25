# Phase 3N UAT plan

Version 1.0 — 2026-09-24. **Execution pending prerequisites and business participants.** Phase 3M is formally approved by the client's latest instruction. No production deployment or new business features are authorized.

## Baseline and pre-UAT review

Reviewed before changes: [production gates](../production/production-gates.md), [Phase 3M evidence](../development/phase-3m-report.md), [scope v1.0](../requirements/06-scope.md), [traceability](../requirements/07-requirements-traceability-matrix.md), requirements open questions, architecture decision register and implementation issues. Historical proposed/pending labels do not override subsequent client approvals through Phase 3M. Q29/Q30, approved inventory, cart, financial, order, fulfilment, returns, notification and reporting semantics remain settled.

Objective: demonstrate approved V1 journeys with representative approved client data, real TEST providers and business operators; record reproducible acceptance evidence. Developer regression and synthetic browser tests are supporting evidence, not business acceptance.

Every remaining gate is classified in the production register. MUST RESOLVE BEFORE UAT means **before the affected case**, not before independent planning or unrelated tests. MUST RESOLVE DURING UAT means evidence required for completion. MUST RESOLVE BEFORE PRODUCTION may remain open at UAT sign-off only where explicitly accepted and the affected capability stays disabled. OPTIONAL POST-LAUNCH covers deferred features only; mandatory payment/webhook evidence cannot be waived into that class.

## Environment and data

**STAGING NOT AVAILABLE** to this session: no staging access/target supplied, no staging env files or deployment target found, and no Git remote configured. This is not a claim that the client owns no infrastructure. Existing local env is local, mail uses an array sink, no Paystack key is configured there, and no approved real-inbox recipient was supplied. Do not promote mocks or local restore evidence to external acceptance.

Provision an isolated staging environment after hosting/access approval: PostgreSQL 18, separate queue/cache Redis, persistent workers (identity/default/transactional/media), scheduler, private object storage, HTTPS/trusted origins/secure cookies, approved email sandbox and Paystack TEST only. Use unique secrets outside source control; never request keys in chat or include them in evidence. Hosted checkout currently needs no frontend public key. Verify callback/webhook origins against the configured staging domain before enabling provider traffic. See environment and Paystack guides.

No approved product dataset was identified in repository docs; the only configuration dataset is explicitly a development example. Existing supplied brand assets/design remain approved. Request names, facts, variant options, SKUs, NGN prices, categories, licensed product images and opening quantities. Developer drafts descriptions from facts; image and delivery-rate sourcing owners need assignment. Import into a new isolated UAT dataset, record source/version and before/after counts, and do not reset or overwrite retained local data. Include simple/multi-variant, low/out-of-stock, taxable/exempt where applicable, and delivery destinations from actual approved data. No invented rates or launch products.

## Participants and responsibilities

| Role (named individual pending) | Responsibilities |
|---|---|
| Business Owner / Super Admin, acceptance approver | Catalog, pricing/stock, dashboard, operational thresholds, owner-only actions and final business sign-off |
| Order Processing Staff | Orders, shipment/handoff/tracking, permitted return operations and denied actions |
| Inventory / Store Staff | Stock/catalog permissions and denied financial/order actions |
| Customer and guest testers | Desktop/mobile purchase, account/history and return journeys |
| Accounting/legal/logistics owners | Actual tax/delivery values, effective dates, policy approval and carrier process |
| Developer/technical operator | Isolated deployment/data setup, evidence, technical negative tests, defects, regression, restore/monitoring/CI |
| Merchant/email/DNS account owners | TEST credentials, approved sender/recipients, provider access, DNS and delivery evidence |

Provision dedicated UAT accounts per role through supported identity workflows, no shared owner password. Staff enrol TOTP and store recovery codes privately; exercise reset and single-use recovery with disposable accounts. Use two distinct customers and scoped guests for ownership negatives. Keep recipient addresses and capability tokens out of published evidence. No provisioning/reset of retained accounts for testing.

## Execution and evidence

Run [acceptance cases](03-acceptance-matrix.md) in dependency order: setup/data → catalog/identity → cart/checkout → provider payment → orders/fulfilment → returns/refunds/mail/reporting → operations. Case groups must record every listed substep separately, not a blanket pass after one action. A failed prerequisite blocks only dependent cases.

For every execution record: case/substep, time/timezone, tester/approver, artifact commit or source manifest hash (working tree is not fully committed), environment, dataset/config version, device/OS/browser version, expected/actual result, sanitized evidence link, defect ID and retest. Keep private raw evidence access-controlled; redact customer data, secrets, authorization headers, cookies, recovery codes, raw provider payloads and card data. Safe provider evidence includes masked reference/event IDs, amounts/currency, timestamps, state transitions and stock/audit counts. Capture real inbound webhook delivery and provider dashboard correlation; a locally generated signature is only a negative/replay supplement.

Results: PASS = all specified assertions observed; FAIL = observed mismatch; BLOCKED = named prerequisite absent; NOT RUN = available but not executed; N/A = documented scope/capability reason approved by business. No elapsed time or silence counts as approval. Evidence from Phase 3M is dated prior engineering evidence, never a new Phase 3N PASS.

For payment: real TEST initialize/card success/decline/same-order retry, actual webhook, invalid signature, replay and correlation; verify exactly one paid transition and stock consumption. Exercise callback/webhook order where practical using a real transaction and safe replay. Determine transfer/refund TEST capability from the merchant account/provider evidence; currently **unknown**, not presumed unsupported. If unavailable, attach exact provider limitation and controlled production-validation gate; refunds stay disabled. Late-payment fixture testing is permitted but must be labelled mocked. No real-money/live calls in this phase.

For mail: approved provider/sender/reply-to and recipients only. Observe order/payment/shipped/return/refund in real inboxes, mobile rendering, links and junk placement; retain provider IDs and DNS checks. Use provider-supported failure/bounce simulation; business transaction must survive failure. Do not send to guessed addresses.

## Browser, mobile and accessibility protocol

Proposed V1 support test policy pending client confirmation: current stable Chrome, Safari and Edge desktop, mobile Safari on iOS and Chrome on Android; record actual versions at execution, no unsupported-browser claims. Physical iOS/Android devices where available; absent devices remain NOT VERIFIED and require explicit coverage disposition. Inspect 320/375/768/1024/1440 px for storefront, cart, checkout, payment return, account/history and critical admin flows. Check overflow, navigation/drawer, images, readable states, usable inputs/buttons and tables.

Human checks: keyboard-only journey and tab order, visible focus, labels and error association, drawer/modal focus restoration and Escape where present; screen-reader form/status announcements where available; 200% zoom and narrow reflow, contrast and non-color status cues, reduced motion. Automated axe/tests support these observations only. The closed Phase 3C.5 design is not reopened; fix verified defects minimally.

## Entry, exit and change control

Entry per case: authorized environment/account, versioned approved data/config, named tester, safe evidence method and prerequisites in the matrix. External payment needs public HTTPS callbacks/webhook and TEST merchant access; email needs approved sender/recipients. Tax/delivery/returns acceptance needs approved actual configuration, not examples.

Exit: required cases executed with evidence and business approval; no open BLOCKER/CRITICAL, no unresolved MAJOR preventing required V1 journey; any MINOR/COSMETIC or optional coverage limitation explicitly accepted with owner/deadline. Required external webhook evidence cannot be replaced by acceptance of a limitation. Production-only gates remain visibly open with milestone deadlines. Record formal client sign-off, then request Phase 3N approval; Phase 3O/deployment requires separate authorization.

Severity: BLOCKER prevents required UAT execution without workaround; CRITICAL causes security exposure, financial/data loss or integrity failure; MAJOR breaks required function; MINOR impairs function with safe workaround; COSMETIC is presentation-only. Missing credentials/business decisions are dependencies, not automatically application defects. Use [defect register](02-defect-register.md); classify new functionality as CHANGE REQUEST and defer or obtain scope approval.

After verified defect remediation, rerun full PostgreSQL PHPUnit/concurrency, Pint, Larastan, Composer audit; frontend clean install/lint/format/TypeScript/Vitest/production build/npm audit; rerun affected provider journeys. No application remediation occurred in this documentation pass, so earlier regression is linked, not relabelled current. Final UAT regression remains pending execution/remediation.

## Operational acceptance

Business/developer jointly walk through the existing local/production runbooks: services, queues/scheduler, failed jobs and notifications, payment review/reconciliation, backup/restore and incident escalation. Stage a safe alert and record a named receiver's observation. Restore a staging backup into a separate disposable database/storage namespace, verify data and working application, then clean up; never restore over the source or production. Agree capacity profile and measure staging query latency/concurrency before making capacity commitments. Run hosted pinned CI on the accepted artifact and record run URL/status and branch protection.

Sign-off uses [04-client-signoff.md](04-client-signoff.md); signatures and accepted limitations remain blank until explicitly provided. Milestone deadlines in the gate register are binding ordering gates, not invented calendar commitments; client/operator must assign actual dates and named owners before scheduling UAT.
