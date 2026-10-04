# Administration UI

Phase 3N admin shell remediation · 2026-09-25 · developer implementation; client retest pending. Supersedes the earlier top-navigation/inline-editor presentation. The approved storefront and business rules remain unchanged.

## Shared application shell

`app/admin/layout.tsx` owns one persistent `AdminFrame`, composed of a desktop sidebar, utility top bar and main content landmark. Individual pages render `AdminShell` from `components/admin/admin-page.tsx` for their title, description, breadcrumbs, primary action and content width. Navigation is never repeated inside individual operational pages.

The desktop sidebar is sticky and independently scrollable, 224px expanded and 76px collapsed. The single compact supplied Iranti brand mark links to Admin. Collapse retains accessible link names and hover titles and stores only the preference in local storage; denied browser storage does not prevent navigation. One local stroked SVG icon set supplements text; no icon package was installed. Current location uses `aria-current=page`, a border/marker, weight and background, including nested edit/detail routes.

Below 1024px the sidebar becomes a native modal drawer, opened from the top bar. It has a labelled trigger, backdrop, explicit forward/reverse Tab boundary wrapping, Escape dismissal and focus return; selecting a destination closes it. The menu remains usable at 320px. The utility bar shows staff name/role and an Account disclosure with My account, Security/MFA and Logout through the existing authentication provider. No role-changing controls appear there.

## Navigation and permissions

| Group | Destinations | Existing grant |
|---|---|---|
| Overview | Dashboard | reports.orders, reports.sales or reports.stock |
| Commerce | Products | catalog.read_internal |
| Commerce | Categories | catalog.create_update |
| Commerce | Inventory | inventory.read |
| Commerce | Orders, including fulfilment in each order | orders.read |
| Commerce | Payments | payments.reconcile; order-processing staff use approved order payment summaries instead |
| Commerce | Returns & refunds | returns.read |
| Management | Staff | staff.provision |
| Management | Reports | approved report grant |
| Management | Notifications | audit.read |

The navigation reads the authenticated identity's permissions and requires completed MFA. Laravel remains authoritative on direct requests, fields and mutations. No new permission, empty Settings destination, separate fulfilment service or notification-sending feature was introduced. Fulfilment remains within the approved order detail workflow.

## Page hierarchy and routes

- Dashboard `/admin`: summary cards for available sales/orders/stock/returns/payment/notification data, with links to operations; no filter form.
- Reports `/admin/reports`: existing scoped operational reports and filters. Notifications `/admin/notifications`: existing safe delivery-health projection; no recipient/payload/secret exposure.
- Products `/admin/products`: searchable/filterable paginated table; Add Product in the header; secondary row actions in a disclosure.
- Product creation `/admin/products/new` and editing `/admin/products/{id}/edit`: readable General/Pricing or Variants/Media/Inventory section selection, with section forms retained while switching. Desktop status/readiness/last-saved/publish/archive panel remains separate from editing. On mobile it follows the selected form. SEO is omitted because no approved editable SEO workflow exists.
- Categories `/admin/categories`: table; `/admin/categories/new` and `/admin/categories/{id}/edit` contain one category form, not a form under every row.
- Inventory `/admin/inventory`: operational table with approved role-specific quantities; one selected stock record in a modal for adjustment/history. The existing movement/confirmation/idempotency workflow is retained. Product editing only links to inventory.
- Orders `/admin/orders`: filtered operational table linking to `/admin/orders/{id}`; detail retains summary, contact, items, payment, fulfilment, history and returns access. Customer order presentation is unchanged.
- Payments `/admin/payments`: table, one selected payment/history dialog and the existing provider-verification action.
- Returns `/admin/returns`: server-filtered queue by existing return states; `/admin/returns/{id}` hosts one review workflow. Refund state is a separate column, not an invented return state.
- Staff `/admin/staff`: table first, invitation dialog, sensitive row actions in a disclosure and existing confirmation dialogs. Recent password/TOTP confirmation remains required. No employee-password field.

## Tables and forms

`AdminTable` supplies semantic headers, caption, focusable labelled overflow region, loading skeleton and empty state. Pagination is provided through its slot/shared `AdminPagination` or the existing cursor controls. Products, Categories, Inventory, Orders, Payments, Returns and Staff use it. Reports retain their existing semantic report tables. Tables scroll inside bounded containers; grid children explicitly permit shrinking so tables cannot widen the document.

List pages have a wide content bound (1480px maximum). Creation/category forms have a 940px page bound and 880px form bound; product editing allocates a separate 260px status column. Forms group labelled controls in two columns where useful and one on narrow screens. Inputs are approximately 38px high; multiline textareas are reserved for descriptions/reasons. Product media previews have an explicit height so image wrappers cannot overlap metadata/upload forms.

API contracts remain stable. Category counts, customer identities in payment/list projections, and staff last activity are not supplied by current list APIs: the UI links to the existing product/order detail rather than fabricating values or fetching whole datasets for counts. Variant option names remain in product editing; inventory identifies the variant by SKU. Refund Pending is not a server return-status filter; refund state is displayed alongside the existing request-state filters.

## Status, action and feedback system

`StatusBadge` presents a readable label and symbol with restrained semantic surface/border styling. State meaning never relies on color alone. Primary actions are Save/Publish/Add; secondary actions are Back/Cancel/Search/View; destructive actions are Archive/Disable, separated and confirmed. Buttons size to their label rather than filling grid cells. Financial actions still follow server-provided eligibility and recent-auth rules.

`ActionMenu` uses a keyboard-operable native disclosure with an accessible label and Escape closure. Native `Modal`/`Drawer` retain focus trapping, Escape handling and trigger-focus restoration. Shared alerts provide assertive errors and polite success feedback; section/table loading avoids replacing the whole workspace. No API exception, SQL, token or provider payload is displayed. Existing backend errors remain translated by the request adapters.

Admin semantic tokens (`--admin-sidebar`, `--admin-sidebar-active`, `--admin-surface`, `--admin-border`, `--admin-muted`, `--admin-table-header`) derive from approved green/cream/charcoal and restrained orange focus accents. New visual overrides are scoped to `.admin-frame`; customer storefront styling and approved business behavior are not redesigned.

## Verification and acceptance

See the current shell addendum in [Phase 3N admin UX report](../development/phase-3n-admin-ux-report.md), the [defect register](../uat/02-defect-register.md), and its linked screenshot evidence. Developer browser automation, accessibility checks and regression results are distinct from human/client acceptance. Phase 3N remains open; Phase 3O is not authorized.

## Phase 3N catalog follow-up — 2026-09-25

Products now separate the primary Edit action from a labelled ellipsis disclosure, without a second Edit inside it. Only applicable Publish/Archive/View storefront/Restore actions appear. Restore has a confirmation and returns to Draft for review. Draft saving remains independent of publication readiness. Tax selection shows approved business labels only; a sole current rule is automatic, multiple rules use a controlled optional dropdown, and missing configuration produces a non-blocking draft notice. Staff land in `/admin` after MFA and have profile/security access through the utility menu; customers retain `/account`.

## Phase 3N row actions and safe delete — 2026-10-02

Admin row actions use the shared `ActionMenu` with a compact labelled ellipsis, one bordered popover of plain rows, viewport-aware positioning and a separated destructive row. It closes on trigger toggle, outside pointer, Escape (returning focus), route change, item selection, or opening another row menu. Products and Categories keep Edit visible and place secondary actions in the overflow; Inventory keeps Adjust stock/View stock visible and moves history into the overflow; Staff uses the compact shared control. Orders, Payments and Returns retain one concise View action because their list rows expose no additional supported operation. Notification/report detail lists have no row actions, so no empty menu is added. State-invalid or unauthorized actions remain absent; payment/fulfilment/return mutations stay in their existing detail workflows.

Only a Business Owner with completed MFA receives the new `catalog.products.delete` and `catalog.categories.delete` grants. Delete is never implied by a broad catalog-write grant. Product deletion is restricted to unused Draft records without media, inventory, reservation, cart, checkout or order references; published/archived records are archived/retained. Empty categories may be deleted only when no product assignment or child category exists. Eligibility shown by the UI is advisory; guarded DELETE endpoints recheck inside transactions and preserve append-only audit. Native modal confirmations explain permanence; successful actions close and refresh with a toast, while failures keep context and show a safe message. See [catalog lifecycle](../development/catalog.md#phase-3n-safe-deletion--2026-10-02).
