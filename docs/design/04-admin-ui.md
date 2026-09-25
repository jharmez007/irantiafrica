# Administration UI

Phase 3C.5 visual baseline · 2026-09-23

## Scope

This phase refines the existing staff workspace, catalog administration and inventory screens. It changes presentation, shared controls and navigation metadata. It does not introduce inventory business logic, commerce workflows, new permissions or backend contracts. Authentication, mandatory staff MFA, CSRF handling, server authorization, API payloads and existing transaction behavior remain intact.

## Operational layout

`AdminShell` provides a distinct staff header, workspace identity, navigation, a skip link and one page-level heading. Storefront merchandising sections and editorial imagery do not appear inside the operational workspace. The staff landing page presents links to existing catalog and inventory tools after its existing access check succeeds.

The design uses the shared warm neutral surfaces, primary green header and restrained borders. Body typography is used for dense section headings and controls. Forms are limited in width, with two columns where space permits and a single column on small screens. Record lists, product media previews and inventory tables favor readable information over decorative cards. Wide tables scroll within their own container instead of forcing page overflow.

Shared `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Badge` and `Alert` primitives replace page-specific control styles. Buttons preserve native form submission behavior. Product and media statuses remain visible as text inside badges; color is supplementary. Archival and image retirement actions use the destructive button variant, which does not use brand orange. Existing loading, empty, validation and conflict messages remain available.

## Catalog preservation

The catalog screen retains product creation and editing, category membership, generic option values, variants, SKU pricing, media upload and ordering, publication and archival. Existing category pagination and membership preservation are unchanged. Product IDs, content versions, price versions, upload validation and other request data are unchanged.

Owner-only mutation controls remain owner-only. The order-processing and inventory/store roles retain their existing read-only catalog view. Customer and incomplete-MFA access boundaries remain in place. Presentation is not an authorization boundary: Laravel policies and approved permissions continue to enforce access.

## Existing inventory preservation

The inventory screen receives shared controls, table styling, status badges and a consistent confirmation panel. Its existing role behavior is retained:

| Role             | Existing visible controls                                                |
| ---------------- | ------------------------------------------------------------------------ |
| Owner            | Stock quantities, movement history and existing opening/adjustment forms |
| Inventory/store  | Read-only quantities and operational movement history                    |
| Order processing | Availability only, without numeric balances or history                   |

**Phase 3D status update (2026-09-23):** the existing inventory surfaces now have a completed and verified backend under accepted ADR-013 revision 2. Phase 3D is ready for its separate approval; see the [inventory report](../development/phase-3d-report.md). The Phase 3C.5 UI design is unchanged.

The stock review still shows the intended change and resulting on-hand quantity. Existing idempotency keys, retry handling, conflict refreshes, validation and server requests are unchanged. This design phase does not alter reservation, allocation or stock calculations.

## Account and security separation

Customer account navigation includes only the existing overview, collection link and conditional staff/security links. It does not add deferred order history, addresses or wishlist screens. Authentication and MFA use the branded auth layout, with visible labels, password affordances and unchanged security flows. Private auth, account and administration routes explicitly remain `noindex`.

## Accessibility and implementation hooks

Native labels, buttons, inputs, fieldsets, table headers and navigation landmarks are retained. Error alerts expose `role="alert"`; nonurgent notices expose `role="status"`. No meaning depends on color alone. The shared focus treatment and reduced-motion rules apply to these routes.

Primary CSS hooks are `admin-shell`, `admin-header`, `admin-main`, `admin-page-heading`, `admin-workspace`, `admin-tool-grid`, `admin-panel`, `admin-form-grid`, `admin-record`, `admin-record-media`, `admin-table`, `admin-pagination` and `admin-confirmation`. Account pages use `account-layout container`, `account-header`, `account-nav`, `account-panel` and `account-details`.

Regression coverage verifies existing catalog and inventory controls alongside authentication payloads, MFA routing, reset-token fragment handling, recovery-code behavior and customer/staff navigation. Visual and accessibility verification limits are recorded in [Responsive and accessibility review](05-responsive-accessibility.md).
