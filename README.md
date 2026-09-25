# IRANTI Africa

A Nigerian physical-goods e-commerce project. Phase 1 requirements and Phase 2 architecture are approved at v1.0, dated 20 September 2026. Phases 3A, 3B and 3C are approved. **Phase 3D Inventory & Stock Integrity is formally approved**; [ADR-013 revision 2](docs/architecture/adr/013-inventory-before-orders.md) is accepted and implemented with inventory-owned references. **Phase 3E Cart & Cart Persistence is formally approved**; see the [cart report](docs/development/phase-3e-report.md). Phase 3F checkout is formally APPROVED; A04 calculation semantics are approved. See the [checkout report](docs/development/phase-3f-report.md). Phase 3G orders and the Phase 3H payment implementation baseline are formally approved; external Paystack verification remains a production/UAT gate. Phase 3I manual shipping/fulfilment is implemented for review; see the [Phase 3I report](docs/development/phase-3i-report.md). **Phase 3C.5 brand/UI refinement is APPROVED AND CLOSED following human QA sign-off on 23 September 2026**; see the [design report](docs/development/phase-3c5-report.md).

| Location           | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| backend/           | Laravel 13 API foundation, PHPUnit and static analysis                        |
| frontend/          | Next.js 16 App Router foundation, TypeScript/Tailwind and quality checks      |
| infrastructure/    | Local PostgreSQL 18 and separate Redis queue/cache services                   |
| scripts/           | Small environment/bootstrap/check helpers                                     |
| .github/workflows/ | Quality CI only; no production deployment                                     |
| docs/requirements/ | Approved requirements, preserved                                              |
| docs/architecture/ | Approved architecture; historical proposal labels superseded by user approval |
| docs/development/  | Setup, environment, tests, decisions and execution report                     |
| docs/design/       | Brand tokens, components, storefront/admin patterns and visual QA             |

Prerequisites: PHP 8.5 with pdo_pgsql, gd, fileinfo and framework extensions, Composer 2, Node 24/npm 11, Git; persistent native Homebrew PostgreSQL 18 and Redis 8.2 for macOS development. Docker Compose v2 is an optional reproducible alternative.

Start with [local setup](docs/development/local-setup.md). See [testing](docs/development/testing.md), [quality checks](docs/development/code-quality.md), [configuration](docs/development/environment-variables.md) and [implementation issues](docs/development/implementation-issues.md).

Current Phase 3A status: see the [final approval report](docs/development/phase-3a-final-approval-report.md). ESLint 9.39.5 is an approved temporary exception with a 10.x target and mandatory upgrade review. Identity/session storage is finalized under ADR-011. Phase 3B is approved; production deployment has not begun.

Approved Phase 3B baseline: [identity/authentication](docs/development/identity-authentication.md), [approved RBAC and MFA](docs/development/rbac.md), and [Phase 3B report](docs/development/phase-3b-report.md). Phase 3C was subsequently authorized by the client.

Phase 3C: [catalog guide](docs/development/catalog.md), [variants](docs/development/product-variants.md), [media and upload configuration](docs/development/product-media.md), and [approval report](docs/development/phase-3c-report.md). Start the local API with `scripts/serve-backend.sh` for catalog upload limits. No production catalog data is seeded.

Phase 3D: [inventory contract](docs/development/inventory.md), [concurrency evidence](docs/development/inventory-concurrency.md), and [current report](docs/development/phase-3d-report.md). The manual stock API/admin controls, immutable ledger, internal reservations and expiry command pass the complete regression and real PostgreSQL races. Apply pending additive migrations with `/opt/homebrew/bin/php artisan migrate` from `backend`; never reset the development database. The default reservation TTL is 900 seconds. Phase 3D was subsequently approved and Phase 3E explicitly authorized; production deployment remains outside this phase.

Phase 3E: [cart ownership/API/merge guide](docs/development/cart.md) and [approval report](docs/development/phase-3e-report.md). Persistent guest/account carts, explicit stock reconciliation and current server pricing are implemented. Defaults: 99 units per line, 100 variants per cart, 30-day guest inactivity. Phase 3F implements guest/account checkout, saved addresses, exact server tax/delivery totals and expiring inventory reservations. Quoting requires explicitly published configuration; no production tax rate or delivery fee is assumed. See the [current Phase 3F report](docs/development/phase-3f-report.md).

## Daily macOS launcher

From the project root, after the native environment is provisioned:

```sh
make dev       # or ./scripts/dev-start.sh
make status    # or ./scripts/dev-status.sh
make stop      # or ./scripts/dev-stop.sh
```

Frontend: http://localhost:3000 · Backend: http://127.0.0.1:8000.

The launcher checks dependencies and service readiness, starts the API, queue worker, scheduler and Next.js, and avoids duplicate processes. Private PID/ownership files and lifecycle logs live in ignored `.runtime/`. Shutdown stops only verified launcher-owned process groups and Redis services; it preserves pre-existing Redis and leaves PostgreSQL running. It does not install dependencies, provision databases, migrate, seed or implement commerce features. See the [authoritative setup guide](docs/development/local-setup.md#one-command-daily-launcher) and [launcher verification report](docs/development/local-launcher-report.md).

Phase 3F: [checkout/API/lifecycle guide](docs/development/checkout.md), [approved tax semantics and operator configuration](docs/development/tax.md), and [delivery rates](docs/development/delivery-rates.md). Apply additive migrations with `/opt/homebrew/bin/php artisan migrate` from `backend`; keep the scheduler running. Checkout confirmation reserves stock; the next explicit action creates an unpaid order. Payment integration remains Phase 3H.

Phase 3G: [orders/API/ownership guide](docs/development/orders.md), [order state machine](docs/development/order-state-machine.md), and [checkout-to-order handoff ADR](docs/architecture/adr/015-checkout-order-promotion.md). Customer history: `/account/orders`; operational staff views: `/admin/orders`. Guest order access uses a scoped 24-hour cookie; email recovery is explicitly deferred. No payment is collected.

Phase 3G is formally approved. Phase 3H payment implementation and its verification evidence are described in [payments](docs/development/payments.md), [Paystack setup](docs/development/paystack.md), [reconciliation](docs/development/payment-reconciliation.md) and the [Phase 3H report](docs/development/phase-3h-report.md). Payments are disabled until privately configured; hosted checkout needs no frontend key. Phase 3H is now formally approved as the implementation baseline; external Paystack verification remains a production/UAT gate.

Phase 3I: [shipping model and carrier configuration](docs/development/shipping.md), [manual fulfilment/API workflow](docs/development/fulfilment.md), and [verification report](docs/development/phase-3i-report.md). Existing owner/Order Processing staff can prepare, dispatch and confirm delivery. Tracking hosts must be explicitly approved and configured; no carrier API is selected. Shipping does not change charged delivery rates or consume stock again.


Phase 3J returns/refunds: [operating guide](docs/development/returns.md), [refund safeguards](docs/development/refunds.md), and [phase report](docs/development/phase-3j-report.md). Phase 3J is formally approved as the implementation baseline; external payment/refund UAT and return-policy production gates remain.

Phase 3K transactional email: [operations](docs/development/notifications.md), [notification matrix](docs/development/notification-matrix.md), [email previews](docs/development/email-templates.md), and [phase report](docs/development/phase-3k-report.md). Phase 3K is formally approved; external email production gates remain.

Phase 3L basic operational dashboard: open `/admin`; see [reporting definitions](docs/development/reporting.md), [dashboard guide](docs/development/admin-dashboard.md), and [phase report](docs/development/phase-3l-report.md). Phase 3L is formally approved; later hardening and UAT status are linked below.

## Phase 3M hardening

Phase3L is approved. Phase3M security/operational verification and fixes are documented in [the hardening report](docs/development/phase-3m-report.md). See [production gates](docs/production/production-gates.md), [environment checklist](docs/production/environment-checklist.md), [operations](docs/production/operations-runbook.md) and [backup/recovery](docs/production/backup-recovery.md). Phase 3M is formally approved and Phase 3N UAT preparation is authorized; production deployment is not authorized. Local workers now include the media queue; restart an existing launcher session to adopt the corrected worker command.

## Phase 3N UAT

[UAT plan](docs/uat/01-uat-plan.md), [defects](docs/uat/02-defect-register.md), [acceptance matrix](docs/uat/03-acceptance-matrix.md), [unsigned client sign-off](docs/uat/04-client-signoff.md), and [current report](docs/development/phase-3n-report.md). Real-provider and business UAT remain pending inputs; prior local tests do not constitute client acceptance.

# irantiafrica
