# PHASE 3N ADMIN INTERACTION POLISH REPORT

Version 1.0 — 2026-09-27. Phase 3N UAT remediation only. Phase 3N remains **OPEN**; Phase 3O has not begun. No commerce/business rule, backend API, production configuration or dependency was changed.

## 1. Product-row action design

Product rows now show a compact outlined **Edit** beside a square ellipsis button with the accessible label **More actions**. Edit is not repeated inside the popover. The trigger is `type="button"`; it does not submit a form. The list controls which row is open, so opening another row closes the first.

## 2. Overflow menu design

Actions follow the product's existing state and publication readiness: a ready Draft shows Publish and Archive; an incomplete Draft omits invalid Publish and shows Archive; Published shows View storefront and Archive; Archived shows Restore. The menu is 176px wide with one subtle border, an 8px radius, soft shadow, 7px padding and approximately 38px rows. The position is calculated from the trigger and viewport on open, resize and scroll; it stays within the viewport and flips above when needed.

## 3. Restore styling fix

Browser inspection found that the shared primary Button style still filled Restore green inside the popover. The admin button selector was more specific than the original menu-row selector. The corrected selector gives every menu action a transparent, borderless, left-aligned row; Archive retains restrained danger text and hover color. The archived-state computed-style check now reports a transparent background and zero inner border, and the [375px screenshot](../uat/evidence/admin-interaction/restore-375.png) was visually inspected.

## 4–7. Account dropdown, outside click, Escape and route change

The shared ActionMenu replaces native disclosure behavior with a React button and popover. Account toggles on a second click. A document `pointerdown` listener closes it only when the target is outside the trigger/menu wrapper; selecting an item runs its existing handler, then closes the popover. Escape closes the menu and returns focus to its trigger. Pathname changes close an open menu. The listeners are installed only while open and removed by effect cleanup. There is no modal overlay or focus trap.

## 8. Accessibility

The button exposes `aria-expanded` and `aria-controls` linked to the persistent, hidden-when-closed panel. Browser keyboard checks verified Edit → More actions → first menu item Tab order, Enter activation, visible trigger/item focus and Escape focus return. The Account button has an accessible label, and its actions remain in natural Tab order. Product-page axe WCAG 2 A/AA and 2.1 AA checks found no violations at the five requested widths. This does not claim screen-reader certification.

## 9. Responsive browser QA

Chrome reviewed loaded `/admin/products` and the top-right Account menu at **320, 375, 768, 1024 and 1440px**. At mobile widths the labelled product table scrolls horizontally to reveal adjacent Edit and ellipsis controls. Each open menu stayed inside the viewport; its first action was hit-testable, and the document had no horizontal overflow. Screenshots were inspected at 320, 375, 768 and 1440px; numeric checks include 1024px. Hover/focus, outside pointer, Escape, toggle, selection, route dismissal and one-open-menu behavior passed. [Screenshots and result records](../uat/evidence/admin-interaction/README.md) are available for client retest.

## 10. Frontend tests, build and audit

Frontend ESLint, supported-source Prettier check, TypeScript and the Webpack production build passed. Vitest passed **209 tests in 21 files**, including Account and product action regressions. `npm audit` reported **0 vulnerabilities** when run with registry access. The first sandboxed audit attempt could not resolve `registry.npmjs.org`; it was rerun successfully with approved network access. No package or lockfile changed. Browser checks used only synthetic data in an isolated QA stack; ordinary local services were not changed.

## 11. Defect status and acceptance

[ADMIN-UX-010, ADMIN-UX-011 and ADMIN-UX-012](../uat/02-defect-register.md) are **FIXED / DEVELOPER RETEST PASS / CLIENT RETEST PENDING**. Earlier Phase 3N entries remain subject to their recorded client acceptance gates. There is no unresolved developer-verified interaction blocker in this requested scope, but business closure still requires dated human UAT acceptance. Phase 3N remains open.
