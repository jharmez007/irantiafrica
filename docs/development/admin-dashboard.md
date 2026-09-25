# Operational admin dashboard

Phase 3L v1 — 2026-09-24. Route: `/admin`. Uses the existing Phase 3C.5 AdminShell, brand palette, typography, buttons, inputs and panels; the storefront is unchanged. Existing order/catalog/inventory/payment/return tools remain linked where applicable. A Dashboard link is added to the shared administration header.

## Using the dashboard

1. Sign in and complete required staff MFA.
2. Select Overview, or the Orders/Inventory/Sales/Products reports permitted to your role.
3. Choose Today, Last 7 days, Last 30 days or an inclusive custom range. Apply filters; the server defines Africa/Lagos boundaries and validates the maximum 366-day range.
4. Select all/low/out/uninitialized stock rows if stock access is granted. This filters the detail list, not its all-active summary counts; inventory is current and independent of date range.
5. Use Previous/Next on a selected detail report. Overview is a bounded preview: 25 report rows or 10 operational queue rows. Totals apply to the complete stated scope, not just displayed rows.

Owner sees applied sales/refunds/net collections, receipt components/holds, order states and backlog, inventory, historical product performance, payment issues, return/refund queues and notification health. Order staff see orders and permitted return intake data; inventory staff see stock. API authorization is authoritative. Responses are tied to the current identity/permission scope; role change/logout immediately hides the prior snapshot, and late requests cannot repopulate it.

Each section states its date basis. Current-state snapshots are not historical state reconstructions. Counts, money and labels come from authoritative API data. Missing sections mean access is unavailable, not that totals are zero. Missing stock balances explicitly show Not configured. Empty lists, loading, denied/MFA and retryable-error states have readable text. Failed refreshes do not leave stale financial cards displayed as current.

Tables are used instead of decorative charts. Daily receipts are in an optional disclosure table. Metric cards wrap long monetary values; historical product names/SKUs wrap. Detail tables may scroll inside labelled keyboard-focusable regions, while the page itself must not overflow. Tables have captions/column headers, filters have labels, status is textual, focus outlines are retained, and no report animation or modal is introduced.

## Verification and limits

Automated frontend tests cover authoritative cards and queues, date selection, permission visibility/role changes, empty state, loading/error/retry, pagination and unauthorized identity. Backend tests independently cover actual authentication/MFA, the permission matrix, date boundaries/abuse, immutable facts and exact arithmetic.

Browser QA uses the actual production frontend build in isolated Chrome with **synthetic API responses** for populated/empty/inventory/order-staff/error/loading/MFA-denied states at 320, 375, 768, 1024 and 1440px. It does not claim live provider or customer data verification. See [phase report](phase-3l-report.md) for final checks, screenshots and any limitations. Common storefront/mobile navigation is not redesigned; the admin header wraps its ordinary links rather than using a new drawer.
