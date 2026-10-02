# PHASE 3N INVENTORY MODAL UX REMEDIATION REPORT

Version 1.0 — 2026-09-27. Phase 3N UAT remediation only. Phase 3N remains **OPEN**; Phase 3O has not begun. Inventory business rules, backend commands, authorization, schema and production configuration were not changed.

## 1. Modal split

The former single Stock record modal loaded and displayed stock adjustment and movement history together. The inventory row now opens **Adjust Stock** and **Stock movement history** through separate actions and data-loading paths. Opening Adjust does not request movement history. The approved order-processing read-only availability view remains available without quantities or history.

## 2. Adjust Stock modal design

A medium-width dialog shows product name, SKU, stock status, on-hand, reserved, available and low-stock threshold. Beneath the compact summary are quantity and reason fields. Review replaces the editable form with the signed change, resulting on-hand quantity, reason and SKU. Movement history is absent.

## 3. History modal design

The wider History dialog shows product/SKU context and a semantic table with date/time, movement type, on-hand and reserved changes, resulting balances, reason and recorded-by columns. Its labelled table region scrolls horizontally inside the dialog on narrow screens, with separate pagination. Existing owner-only reason/actor visibility is preserved; inventory staff see the operational redaction.

## 4. Quantity input behavior

Quantity is a labelled `type="number"` input with `step="1"` and a linked hint: “Use a positive number to add stock or a negative number to remove stock.” The input change guard accepts only a partial signed integer while editing. Existing frontend review checks still reject zero, fractions, unsafe/out-of-range changes and stock below reserved. The backend `InventoryInteger` rule and inventory service remain authoritative and unchanged; their existing tests reject string coercion, exponent strings, floats and invalid bounds. Chrome rejected letters and `1e3`, and accepted `-2`.

## 5. Action button layout

The form footer separates secondary **Cancel** from **Review stock change**. Review has a distinct footer with secondary **Cancel review** and primary **Confirm stock change**. On narrow screens the actions stack at full width, preserving spacing and touch targets.

## 6. Modal close behavior

Cancel immediately dismisses Adjust. A successful confirm dismisses it, displays the existing success message and reloads inventory. A failed POST keeps the dialog/review open with a clear error and the same reviewed idempotency key available for retry. A version conflict clears review, refreshes current quantities and requires a new review. History closes from its Close button, Escape or the shared dialog backdrop behavior.

## 7. Reset state behavior

The shared modal reset clears selection, quantity, reason, review, prior idempotency key, movement page/data and modal validation error. Reopening starts with empty inputs and no stale review. Closing History also resets its page. Background request effects cancel their state updates after closure.

## 8. Accessibility

Both native dialogs have semantic titles. Browser checks found initial focus inside each dialog and focus return to the invoking action after Cancel, Escape and backdrop dismissal. Quantity and reason have explicit labels; the quantity hint is associated through `aria-describedby`. History uses a caption, column headers and a row header; its scroll region is keyboard-focusable and labelled. Axe WCAG 2 A/AA and 2.1 AA checks found no violations in either modal at the requested widths. This is not screen-reader certification.

## 9. Responsive QA

Authenticated Chrome review covered both dialogs at **320, 375, 768, 1024 and 1440px**. Dialog bounds stayed inside each viewport, with no page-level horizontal overflow. The mobile stock summary was compacted into two columns so the form actions remain visible; the history table scrolls within the dialog. [Screenshots and measured results](../uat/evidence/inventory-modals/README.md) document the pass. The 375px review screenshot shows the separated footer.

## 10. Frontend tests and build

The inventory component tests cover separate entry points, no history fetch on Adjust, numeric input and hint, cancel/reset, successful close/refresh, failure staying open, unchanged retry key, conflict refresh, opening balance, history pagination and permission-based redaction. The full frontend suite passed **212 tests in 21 files**. ESLint, source Prettier check, TypeScript, Webpack production build and `npm audit` passed; audit found **0 vulnerabilities**. No package or lockfile changed.

## 11. Backend regression

The affected `InventoryTest.php` integration suite passed against isolated PostgreSQL/Redis: **12 tests, 309 assertions**. It covers strict integer parsing, signed adjustments, stock limits, idempotency, history and role access. No backend source or inventory rule was modified.

## 12. Defects and acceptance

[ADMIN-UX-013 through ADMIN-UX-017](../uat/02-defect-register.md) are **FIXED / DEVELOPER RETEST PASS / CLIENT RETEST PENDING**. There is no unresolved developer-verified blocker in this requested modal scope. Earlier Phase 3N acceptance and external-provider gates remain open. The isolated browser/API/frontend and PostgreSQL QA processes were stopped after verification; ordinary local services were left alone.

**PHASE 3N REMAINS OPEN. PHASE 3O HAS NOT BEGUN.**
