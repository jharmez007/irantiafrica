# Phase 2 architecture review — IRANTI Africa
**Architecture baseline: v0.1, 2026-09-20 — proposed for approval.**

The user formally approved Phase 1 v1.0 (2026-09-20) and authorized architecture only in the subsequent approval instruction. That instruction supersedes the historical “approval pending” wording in the seven frozen [requirements documents](../requirements/01-project-discovery.md). Those files are preserved verbatim. This package does not approve itself, authorize implementation, or change the business baseline.

## Review outcome
A modular Laravel backend, Next.js frontend and PostgreSQL transaction boundary support the approved V1. The architecture is ready for review; implementation requires Phase 2 approval and the relevant gates in [31](31-open-architecture-decisions.md). Package versions are documented release candidates, not an installed or tested dependency lock. No application, migration, endpoint, page or deployment has been created.

Confirmed MVP: physical catalog/search/categories/options; NGN common customer prices with variant prices; guest and account checkout; saved addresses/history; stock protection and zero-stock hiding; checkout tax displayed separately; Paystack cards and automatically confirmed transfers; same-order payment retry; order milestones; Nigerian location-based delivery and tracking number/link; eligible guest/account same-day return requests and owner-approved refunds; three restricted staff roles; order/payment email confirmations; basic operational sales/order/stock reports, including the basic product performance requested for Phase 2.

Deferred: wishlist, reorder, reviews, bulk discounts, marketing/subscriptions/cart reminders, advanced analytics and Africa expansion. No new external business-system integration, legacy migration, carrier live tracking API, marketplace or wholesale account model is introduced. Q29/Q30 remain resolved.

## Reading order
1. [Stack](01-technology-stack.md), [modules](02-modular-architecture.md), [context](03-system-context.md), [runtime](04-container-architecture.md).
2. [Frontend](05-frontend-architecture.md), [backend](06-backend-architecture.md), [domain](07-domain-model.md), [database/ERD](08-database-design.md).
3. [Inventory](09-inventory-architecture.md), [checkout](10-checkout-architecture.md), [states](11-order-state-machine.md), [payments](12-payment-architecture.md), [tax](13-tax-architecture.md), [shipping](14-shipping-architecture.md), [returns](15-returns-refunds.md).
4. [Authentication](16-authentication.md), [permissions](17-rbac.md), [API inventory](18-api-design.md), [threat model](19-security-threat-model.md), [privacy/audit](20-privacy-audit.md).
5. [Email](21-notifications.md), [reports](22-reporting.md), [media](23-media.md), [cache/queue](24-cache-queue.md), [observability](25-observability.md), [recovery](26-backup-recovery.md).
6. [Deployment](27-deployment-architecture.md), [environments](28-environments.md), [CI/CD](29-cicd.md), [testing](30-testing-strategy.md), [decisions](31-open-architecture-decisions.md), [future roadmap](32-implementation-roadmap.md).
7. [ADR index](adr/README.md).

## Scope-to-design review map
| Approved requirements | Primary design | Acceptance anchor |
|---|---|---|
| FR-CAT-001–004; FR-PRC-001 | 05, 07, 08, 18 | US-C01, US-C03, US-A01 |
| FR-CART-001; FR-CHK-001; FR-ACC-001/002/005 | 10, 16, 18 | US-C02, US-C04, US-G01, US-R01 |
| FR-TAX-001; NFR10/14 | 08, 10, 13 | US-C03 |
| FR-INV-001–003 | 08–12 | US-C02, US-C04, US-A02 |
| FR-PAY-001–004 | 08, 12, 19, 25 | US-C04 |
| FR-ORD-001–003; FR-SHP-001/002 | 11, 14, 18 | US-C05, US-O01 |
| FR-RET-001–004; FR-POL-001 | 15–17, 20, 31 | US-G02, US-R04, US-A06 |
| FR-ADM-001/002; NFR01/15 | 16–20 | US-A03, US-I01 |
| FR-NOT-001; FR-RPT-001 | 21–22 | US-C05, US-A04 |
| FR-SEO-001; NFR04/16/17 | 05, 23, 30 | US-C10 |
| FR-OPS-001; NFR03/06/07/12 | 19–20, 24–30 | US-A08 |
| NFR02/05/08/09/11/13 | 01–04, 06, 09, 12, 25, 29–32 | Integrity, performance and delivery gates |
| FR-CNT-001/002; PR-SCH-001 | 23, 31–32 | Asset ownership and flexible scheduling |
| FR-INT-001; FR-DAT-001 | 03, 14, 32 | Explicit exclusions preserved |
| All deferred IDs | This scope boundary; 22, 31 | No V1 routes/tables/jobs for deferred features |

## Responsibilities and risks
Client supplies product names/prices/stock/branding, approves policy and permission proposals, arranges merchant/logistics/domain accounts and assigns business/UAT approvers. Image and rate-supply ownership remain unassigned. Developer designs/builds/tests after authorization, writes descriptions and policy drafts, implements controls and prepares operating runbooks. Client/legal review of policy drafts precedes production.

Third-party dependencies are Paystack, email transport, delivery operations/rates, infrastructure, managed database/Redis and object storage. Logistics need not expose an API. Provider failures are isolated from database transactions.

Largest risks: late/duplicate payments; unresolved return clock and cancellation rules; inaccurate rates/tax/catalog data; permission mistakes; insufficient operating budget/ownership. Controls and gates are documented, not claimed deployed. Single store, single stock pool, English-first presentation and one shipment/order are review assumptions; contradictory answers trigger an ADR/change request before affected implementation.

## Documentation verification
Verified 32 numbered design documents, nine ADRs with all required sections, two navigation indexes, 41 logical table specifications and seven Mermaid blocks. Relative Markdown links, table column consistency and code-fence pairing pass structural checks. All Q01–Q33 references are accounted for in the decision register; all seven Phase 1 SHA-256 hashes remain unchanged. Mermaid diagrams have not been rendered, and no dependency installation, application test, migration or deployment was performed. Compatibility is documentary evidence plus explicitly named future validation gates.

**Review status: PHASE 2 READY FOR APPROVAL.** No Phase 3 work is authorized by this report.
