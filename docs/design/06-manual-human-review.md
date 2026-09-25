# MANUAL HUMAN REVIEW — Phase 3C.5

**Current status: HUMAN QA PASSED — PHASE 3C.5 APPROVED AND CLOSED.** Closure baseline v1.0 — 2026-09-23.

User sign-off: “human QA passed, close Phase 3C.5.” This closes the requested visual and accessibility review scope. Acceptance is attributed to the user, not to a new agent browser inspection. No per-cell measurements, screenshots or browser version were supplied.

The v0.2 worksheet below is retained as the historical handoff and agent evidence. Its NOT INSPECTED labels and unchecked boxes describe the agent’s pre-sign-off coverage; they are not current open tasks and have not been converted into fabricated individual agent PASS results. See the human sign-off log and [closure report](../development/phase-3c5-report.md#19-human-qa-sign-off-and-phase-closure).

## What was actually inspected

The current attempt used a private Chrome window at `http://localhost:3000/`, with the responsive toolbar visibly reporting **320px** width (737px available height).

| Evidence | Inspected observation                                                       | Result and boundary                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E01      | Visible homepage header: logo, menu, search, account and inactive bag       | PASS for fitting within the visible 320px header without clipping; destinations and keyboard operation were not verified                                                |
| E02      | Visible hero: heading, supporting text, collection button and brand artwork | PASS for readable text, usable-looking spacing and visibly proportionate artwork in this region; full-page overflow was not measured                                    |
| E03      | Pointer activation of mobile menu                                           | PASS: drawer opened and displayed its title, close control, Shop, Collections, Our story and account links within the viewport                                          |
| E04      | Keyboard Tab after opening the drawer                                       | NOT VERIFIED: browser control returned a changed-application interruption; focus containment, focus visibility, tab order, Escape and focus restoration remain untested |
| E05      | Full-page horizontal overflow measurement                                   | NOT VERIFIED: console paste operation timed out; no measurement result was returned                                                                                     |

A clipboard timeout and subsequent changed-application interruptions prevented reliable completion. One refreshed-state attempt and a direct coordinate click produced E03; further keyboard review was interrupted again. No console security warning was bypassed by the agent. No confirmed visual defect was established, and no application code or business logic was changed.

Earlier desktop screenshots and automated tests remain historical evidence in the main report. They do not count as current exact-width route acceptance.

## Chrome setup and available data

1. From the repository root, use `make status`. If necessary, use the existing `make dev` launcher. No installation, migration or database reset is needed for this review.
2. Open `http://localhost:3000/` in a clean Chrome window. Use existing approved QA accounts for account/admin review, including required staff MFA. Record the role used; a sign-in screen does not verify the protected account or admin layout.
3. Open DevTools → Toggle device toolbar → **Responsive**. Set browser page zoom to **100%**. Review each exact width: **320, 375, 768, 1024, 1440 CSS pixels**. Use a consistent height such as 900px and scroll the entire page. Toolbar “Fit to window” only changes the preview scale; record the actual width field.
4. Use an actual public product slug where available. The inspected homepage showed no catalog products. If no suitable product, category or authorized test account is available, record **NOT AVAILABLE**, the reason and the unreviewed component/state. Do not silently count that as PASS or populate the persistent database with invented business data.
5. Existing read-only design fixtures are stored under `.runtime/brand-review-fixtures/`. They are not production routes and are not currently served. An isolated fixture review, if used, must be identified as such and cannot establish real account authorization or final product-photography acceptance.

## Historical route × viewport worksheet — human scope now signed off

Use `PASS`, `FAIL`, `PARTIAL`, `NOT INSPECTED` or `NOT AVAILABLE (reason)`. A cell may become PASS only after every applicable visual check V01–V13 below has been inspected for that route/width. Record route-specific states and evidence in the sign-off log. `PARTIAL E01–E03` is not a page acceptance.

| Route / state                                                                  | 320px                                  | 375px                                  | 768px                                  | 1024px                                 | 1440px                                 |
| ------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| `/`                                                                            | PARTIAL E01–E03                        | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          |
| `/products` — empty and populated where available                              | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          |
| `/products/<actual-slug>` — available, selected variants and unavailable state | NOT INSPECTED / needs product          | NOT INSPECTED / needs product          | NOT INSPECTED / needs product          | NOT INSPECTED / needs product          | NOT INSPECTED / needs product          |
| `/search` — query and no-match result                                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          |
| `/login`                                                                       | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          |
| `/register`                                                                    | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          |
| `/forgot-password`                                                             | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          | NOT INSPECTED                          |
| `/account` — authenticated overview and signed-out redirect                    | NOT INSPECTED / needs QA account       | NOT INSPECTED / needs QA account       | NOT INSPECTED / needs QA account       | NOT INSPECTED / needs QA account       | NOT INSPECTED / needs QA account       |
| `/admin/catalog` — authorized catalog forms/records and access-denied state    | NOT INSPECTED / needs staff QA account | NOT INSPECTED / needs staff QA account | NOT INSPECTED / needs staff QA account | NOT INSPECTED / needs staff QA account | NOT INSPECTED / needs staff QA account |

### Visual checks to apply to every worksheet cell

All unchecked items below require human inspection; none is a claimed pass.

- [ ] **V01 — Overflow:** scroll from top to footer; no page-wide horizontal scrolling, clipped content or controls outside the viewport. Inspect long text and errors. A table may scroll inside its own region without widening the page. Optionally type `document.documentElement.scrollWidth <= document.documentElement.clientWidth` in Chrome's Console and record the result; this complements, rather than replaces, visual inspection.
- [ ] **V02 — Header/navigation:** actual links reach intended existing routes/anchors; account and search remain reachable. Auth/admin pages use their intended separate shell. The inactive bag must not trigger an unimplemented cart.
- [ ] **V03 — Logo:** artwork is complete, proportionate and readable; no stretching, clipping of the mark or broken asset.
- [ ] **V04 — Typography:** headings, labels, prices, body text, captions and long names remain legible and wrap without overlap.
- [ ] **V05 — Spacing:** gutters, section spacing, field gaps, controls and footer columns remain consistent; no collisions or unintended blank gaps.
- [ ] **V06 — Buttons:** labels fit, disabled/submitting states are understandable, pointer targets are usable and adjacent actions are distinguishable.
- [ ] **V07 — Inputs:** fields and selects fit; focus, typing, password reveal, labels and native dropdown options remain usable. Avoid submitting real mutations solely for visual review.
- [ ] **V08 — Images:** actual media, thumbnails and fallback states maintain intended proportions; no distortion or broken image. Supplied logo gallery fixtures are not final product photography.
- [ ] **V09 — Product cards:** image areas, names, prices and badges align; long content wraps; multiple rows remain consistent; no clipped availability label.
- [ ] **V10 — Filters:** query, category and sort controls wrap correctly; Apply/Clear and pagination remain reachable. Submit a harmless GET search and confirm the filter values are retained.
- [ ] **V11 — Auth forms:** login/register/recovery forms, supporting links, validation and submitting states fit without horizontal scrolling or obscured actions.
- [ ] **V12 — Admin:** review authorized product/category forms, variants, media records and any table regions; labels/actions remain readable, local scrolling works and role-restricted controls remain appropriate. Use isolated test data for any necessary mutations.
- [ ] **V13 — States:** inspect readable loading, empty, unavailable and error states where available. Use throttling or request blocking scoped to the QA tab for safe loading/error inspection, then restore normal networking. Do not stop shared services to simulate an error.

### Route-specific states to record

- **Homepage:** full story/footer, empty catalog and real category/product sections if available; anchor navigation.
- **Listing/search:** no-match query, long query, category/sort selection, pagination where enough data exists, skeleton and failed-read recovery.
- **Product detail:** all thumbnails, complete/incomplete variant selection, exact displayed price changes, disabled unavailable choices, long description and sold-out information. No cart action.
- **Login/register/recovery:** empty submission, malformed email, password reveal, password guidance/confirmation and appropriate general or field-specific error text. A reset email or account creation is not necessary merely to inspect the initial form.
- **Account/admin:** signed-out boundary, authenticated account details, staff MFA and authorized staff/owner presentation where accounts exist. Do not bypass MFA or RBAC for visual convenience.

## Historical manual accessibility checklist — human scope now signed off

At the v0.2 agent handoff, each item was **NOT VERIFIED in that browser pass**, unless the limited observation E01–E03 expressly says otherwise. Prior jsdom axe results are not manual browser passes.

- [ ] **A01 — Keyboard-only paths:** use Tab, Shift+Tab, Enter, Space and native select keys to reach and activate navigation, filters, pagination, form actions and gallery controls. Confirm no pointer-only action.
- [ ] **A02 — Focus visibility:** inspect a visible, unobscured focus indicator on light and green surfaces, fields, links, buttons, thumbnails and drawer controls. Check it after scrolling and zooming.
- [ ] **A03 — Tab order/skip link:** logical DOM order, no unexpected positive-tabindex jumps, hidden controls skipped, skip link moves to main content. Follow the entire page and return backward.
- [ ] **A04 — Labels and names:** visible labels activate their controls; DevTools Accessibility pane exposes correct names, roles and states. Icon controls, gallery thumbnails, select fields and password visibility buttons have meaningful names.
- [ ] **A05 — Errors:** trigger safe native validation; focus identifies the affected input. Where field-specific application errors exist, confirm `aria-invalid` and an associated description identify the field. General authentication failures should be announced as general alerts, without incorrectly claiming every field is invalid. Verify errors are text, not color alone.
- [ ] **A06 — Drawer/modal entry and containment:** open the menu by keyboard; focus enters the named dialog; Tab and Shift+Tab stay within its controls; underlying page is not operable while modal. Inspect close button and navigation-link closure separately.
- [ ] **A07 — Escape and restoration:** Escape closes an open drawer/modal, does not navigate unexpectedly, and returns focus to the invoking control. Repeat with the close button. Do not treat Escape closing DevTools as an application pass.
- [ ] **A08 — Contrast:** inspect actual rendered foreground/background pairs using Chrome's color/contrast tools, including hover/focus/error/disabled states where applicable. Normal text target 4.5:1, qualifying large text 3:1, meaningful control/focus boundaries 3:1. Historical palette calculations do not verify the applied styles of every state.
- [ ] **A09 — Non-color cues:** unavailable products/options, selection, errors and success remain understandable through text, icons, borders or native state. Verify stock badge text stays visible.
- [ ] **A10 — Zoom/readability:** in desktop Chrome, inspect at 200% and 400% page zoom; content reflows and remains operable without loss of actions or text. Record the resulting viewport, then reset to 100%. Check long account emails, recovery codes and form errors where available.
- [ ] **A11 — Reduced motion:** DevTools → More tools → Rendering → emulate `prefers-reduced-motion: reduce`. Confirm skeleton animation and image/control transitions stop and anchor scrolling is not animated; content remains present. Restore the prior emulation afterward.
- [ ] **A12 — Live updates/semantics:** verify one main landmark/clear H1, logical headings, alt text, live price/availability updates, alerts and loading messages. A manual screen-reader check may supplement Chrome's accessibility tree; do not claim it ran unless it did.

## Human sign-off log

For every worksheet cell, record `V01–V13 = PASS / FAIL / N/A (reason)`; record applicable A01–A12 results separately. A missing state is a recorded coverage limitation, not a pass.

| Reviewer/date     | Browser/version | Route/role/state                       | Width / zoom / motion                             | Check IDs and results                              | Screenshot or notes                                      | Defect ID / follow-up                      |
| ----------------- | --------------- | -------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| User / 2026-09-23 | Not supplied    | Requested available-route review scope | Requested widths and accessibility scope accepted | Human QA passed overall; no new agent measurements | Explicit conversation sign-off; screenshots not supplied | No unresolved Phase 3C.5 blockers reported |

## Approval rule and closure

Phase 3C.5 can become ready only after the available route/viewport checks and applicable manual accessibility checks have evidence, confirmed defects have minimal fixes and rechecks, and any unavailable-data coverage limitations are explicitly recorded and accepted. Client fonts/photography/policy copy remain separate content dependencies. Do not equate lack of a confirmed defect with a completed pass.

**The user’s explicit human QA sign-off satisfies the phase acceptance gate. Current result: PHASE 3C.5 APPROVED AND CLOSED. Phase 3E has not begun.**
