# 05 — Responsive design and accessibility

Phase 3C.5 — Brand Identity & UI Design System. Evidence date: 2026-09-23. Final QA follow-up v0.2 uses the user-requested 320/375/768/1024/1440px widths; see [MANUAL HUMAN REVIEW](06-manual-human-review.md) for the historical worksheet, agent observations and subsequent human sign-off.

This document distinguishes measured palette evidence, executed automated tests and partial browser review. It does not claim WCAG conformance or a completed browser accessibility audit.

## Closure status

**Phase 3C.5 approved and closed — v1.0, 2026-09-23.** The user confirmed “human QA passed, close Phase 3C.5.” This resolves the human visual/accessibility review gate. The measurements and agent-only pending rows below are historical evidence; no new automated or agent browser results are claimed. Human acceptance is recorded in [document 06](06-manual-human-review.md) and [the closure report](../development/phase-3c5-report.md#19-human-qa-sign-off-and-phase-closure).

## Contrast evidence

Ratios below were calculated from the supplied sRGB hex values using linearized relative luminance and `(lighter + 0.05) / (darker + 0.05)`. Values are displayed to four decimal places; pass/fail decisions use unrounded values.

| Color pair                           |     Ratio | AA normal text, 4.5:1 | Large text / essential non-text, 3:1 |
| ------------------------------------ | --------: | --------------------- | ------------------------------------ |
| Charcoal `#3C4142` / white `#FFFFFF` | 10.3605:1 | Pass                  | Pass                                 |
| Charcoal / cream `#F4EEE1`           |  8.9612:1 | Pass                  | Pass                                 |
| Green `#335438` / white              |  8.5158:1 | Pass                  | Pass                                 |
| Green / cream                        |  7.3657:1 | Pass                  | Pass                                 |
| Orange `#B85A22` / white             |  4.6423:1 | Pass                  | Pass                                 |
| Orange / cream                       |  4.0153:1 | **Fail**              | Pass                                 |
| Orange / charcoal                    |  2.2318:1 | Fail                  | Fail                                 |
| Orange / green                       |  1.8344:1 | Fail                  | Fail                                 |
| Green / charcoal                     |  1.2166:1 | Fail                  | Fail                                 |
| Cream / white                        |  1.1562:1 | Fail                  | Fail                                 |

Normal text requires 4.5:1. Large text means at least 18pt regular or 14pt bold, approximately 24px or 18.67px respectively; a CSS class named “large” does not establish this. Essential component boundaries and state indicators require the applicable non-text contrast. [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Consequences for implementation:

- Body text and small labels use charcoal or green on cream/white. Do not use small orange text on cream.
- A white field on cream needs a sufficiently contrasting visible boundary where that boundary identifies the control. The two background colors alone differ by only 1.1562:1.
- Orange remains a brand accent, never the error/destructive color. Charcoal error text, an explicit symbol, a descriptive message and a distinct border communicate the error together.
- Use a green focus ring on light surfaces and a light ring on dark green. An offset or contrasting gap helps prevent a ring merging with the component edge.
- Muted text must be measured against its final composited background. As a reference, 80% charcoal over cream rounds to `#616462`, measuring 5.1785:1. Do not assume every opacity/tint retains this result.
- Availability, errors, selection and success require wording or another non-color cue. [W3C use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

These calculations cover the base palette only. They do not verify every rendered state, browser antialiasing, opacity mixture, image overlay or focus indicator.

## Responsive review matrix

The widths below are CSS-pixel viewport targets. **The agent review was partial; the approval gate was subsequently closed by human sign-off.** Native Chrome review was interrupted repeatedly by changed-window/input notifications. A 320px homepage screenshot was obtained; the complete route/width matrix was not executed. Unmeasured desktop screenshots are not substitutes for exact 1024px and 1440px checks.

| Viewport width        | Review focus                                                                          | Executed result                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 320px — small mobile  | Header/menu access, form labels, long text, card/grid minimum width, no page overflow | Partial: homepage header, hero and first section visually inspected at 320px; fit correctly. Other routes, full-page overflow and keyboard review pending. |
| 375px — large mobile  | Touch targets, gallery/variant controls, stacked auth layout, pagination              | Pending browser QA                                                                                                                                         |
| 768px — tablet        | Navigation transition, grid density, filter wrapping, editorial/form balance          | Pending browser QA                                                                                                                                         |
| 1024px — laptop       | Header spacing, readable content widths, product detail columns, admin density        | Pending browser QA                                                                                                                                         |
| 1440px — wide desktop | Bounded content width, image scaling, whitespace, no stretched text columns           | Pending browser QA                                                                                                                                         |

Every width must retain navigation, search, account access, visible labels and meaningful error/empty states. Avoid fixed-width descendants that force the entire page to scroll sideways. Operational tables may use a clearly identified local scroll region when two-dimensional data needs it; the surrounding page and its controls still fit the viewport. Test long product names, long option values, email addresses and validation messages.

Check browser zoom and text resizing as well as viewport width. Content and focus must remain usable when text wraps. Target approximately 44 × 44 CSS pixels for touch controls where practical; do not achieve density by making adjacent icon controls difficult to operate. This is a design target, not a claim that every WCAG criterion prescribes 44px.

## Shared component accessibility requirements

| Component or pattern                  | Required behavior and review                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header, footer and page shell         | Semantic landmarks; usable skip link; distinct navigation labels; one clear page H1; logical heading order                                                                                              |
| Logo                                  | Preserve artwork proportions; meaningful accessible name when linked; avoid duplicate announcements for decorative repeats                                                                              |
| Buttons and links                     | Buttons perform actions; links navigate; icon-only buttons have names; disabled states remain understandable; visible keyboard focus                                                                    |
| FormField, Input, Select and Textarea | Visible labels associated with controls; appropriate autocomplete/input mode; hints/errors connected through `aria-describedby`; invalid controls use `aria-invalid`                                    |
| PasswordInput                         | Named show/hide control; correct button type; toggling does not submit the form or clear its value; existing auth behavior preserved                                                                    |
| Checkbox and Radio                    | Native control semantics; clickable associated labels; fieldset/legend for related choices; state not conveyed by color alone                                                                           |
| FieldError and Alert                  | Actionable text; explicit non-color indicator; suitable alert/status announcement without unnecessary repeated live messages                                                                            |
| Product and Category cards            | Descriptive destination names; image alt appropriate to its role; no nested interactive elements inside one another; no new cart action                                                                 |
| Gallery and variant selection         | Named keyboard-operable controls; available/unavailable state comes from approved data; unavailable choices disabled; price changes remain readable                                                     |
| Breadcrumbs and Pagination            | Named navigation; current page identifiable; previous/next destinations retain active filters; unavailable navigation is not a misleading clickable link                                                |
| Modal and Drawer                      | Accessible title; suitable dialog semantics; focus moves into the open panel and stays within a modal panel; Escape/close works; focus returns to its trigger; background is not inadvertently operable |
| EmptyState and Skeleton               | Clear empty/error guidance; loading has an understandable status; decorative skeletons are hidden from assistive technology; no misleading stock/product claims                                         |
| Admin tables/forms                    | Header cells associated with data; readable numbers; named actions; role-restricted controls retain backend enforcement; local scrolling has an understandable context                                  |

Verify keyboard operation using Tab, Shift+Tab, Enter, Space, Escape and native select behavior as appropriate. Confirm visible focus in the actual browser rather than relying only on the existence of a CSS selector. No essential action may depend on hover. Respect `prefers-reduced-motion`; content must remain present when animation is reduced.

## Existing QA capabilities and limits

Repository tooling inspected for this phase:

- Vitest 5.0.1, JSDOM 29.1.1, Testing Library React 16.3.3 and user-event 14.6.7 are installed. Existing catalog tests already exercise labels, selection, pricing, empty states and disabled variants.
- `axe-core` 4.13.0 is available in the installed dependency tree at `frontend/node_modules/axe-core/axe.min.js`; no additional installation was performed for reconnaissance.
- Native Google Chrome is available for CUA browser/keyboard/visual review. Browser automation for this task follows the available CUA runtime instructions.
- The frontend has no installed Playwright, `@playwright/test`, `@axe-core/playwright` or `jest-axe` package. Their absence is not a reason to claim those suites ran.

JSDOM and component tests can exercise interaction and inspect semantic markup. They do not establish real CSS layout, rendered contrast, responsive overflow, actual font metrics or complete accessibility. Any axe run must record its actual environment, scope and exclusions; installed tooling alone is not an executed audit. Manual screen-reader acceptance remains distinct from automated checks.

## Route and state review checklist

Recorded evidence is deliberately separated from component tests. Read-only HTTP smoke requests returned 200 for existing homepage, collection/search, auth, account and admin-catalog shells; this does not prove authorized client-side content or rendered layout. Use the checklist below to finish the visual gate. Use a real configured catalog fixture for the product-detail path rather than requesting the literal `[slug]` segment.

| Route                | States to inspect                                                                                          | Result                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/`                  | Header, editorial hero, category/product sections, empty catalog, footer, logo rendering                   | Partial: Chrome desktop and 320px homepage visual review; real local catalog empty.                            |
| `/products`          | Filters, sorting, result count, image-led cards, pagination, empty/error/loading                           | Partial: Chrome desktop empty collection, filters and pagination visually inspected; populated layout pending. |
| `/products/[slug]`   | Gallery, long description, variant price changes, unavailable selection, informational unavailable product | Component regression passes; populated browser review pending.                                                 |
| `/categories/[slug]` | Category heading, consistent filters/cards, empty category                                                 | Pending                                                                                                        |
| `/search`            | Query persistence, result count, empty results, pagination                                                 | Pending                                                                                                        |
| `/login`             | Labels, password visibility, validation, error and submitting states                                       | Pending                                                                                                        |
| `/register`          | Field hierarchy, validation, password confirmation, keyboard flow                                          | Pending                                                                                                        |
| `/forgot-password`   | Recovery input, generic success messaging and errors                                                       | Pending                                                                                                        |
| `/reset-password`    | Existing fragment-token handling preserved, password controls and validation                               | Pending                                                                                                        |
| `/mfa`               | Enrollment, OTP/recovery form, once-only recovery codes, keyboard/readability                              | Pending                                                                                                        |
| `/account`           | Loading, authorized identity, existing navigation, sign-out and errors                                     | Pending                                                                                                        |
| Admin catalog routes | Authorized read/edit states, dense forms, modal/confirmation behavior, validation and media controls       | Pending                                                                                                        |

Review role-specific admin presentation without weakening backend authorization. Do not invent future account pages, cart flows, policy content or payment actions to complete this checklist. Final client photography, approved product descriptions, contact/social destinations and final policy content remain content acceptance inputs.

## Executed verification and limits

- **74 frontend tests pass across nine files**, including catalog filters/pagination/variants/gallery, auth payloads and destinations, password reveal, fragment-token clearing, MFA/recovery handling, account/admin permissions, dialog cancellation/focus restoration and public/private chrome boundaries.
- **Six axe-core 4.13.0 scans pass** in jsdom: login, registration, populated catalog, modal, header/footer and open drawer. WCAG 2 A/AA and 2.1 A/AA tags were tested. `color-contrast` was excluded because jsdom does not render pixels. Native-dialog methods were mocked for component tests; a real browser focus-trap check remains required.
- Base-palette contrast calculations above pass for the chosen normal-text pairs. They do not certify every rendered state or image.
- `npm ci`, ESLint, Prettier check, TypeScript, Vitest, production build and `npm audit --audit-level=moderate` passed. Audit: **zero vulnerabilities**. Clean install/build ran in an ignored source copy to avoid disrupting the user's already-running development services.
- Affected Laravel authentication/MFA/RBAC/catalog regressions passed **49 tests / 951 assertions** against isolated `iranti_test`. Deferred inventory tests were excluded. The temporary test PostgreSQL cluster was stopped; persistent local data was untouched.
- Browser observations: Chrome desktop homepage and empty collection; a 320px homepage with a fitting header, readable hero and original artwork; an intermediate 583px stacked story treatment. These are partial observations, not a completed five-width matrix.
- The regular Chrome profile injected an `inmaintabuse` body attribute and caused a hydration warning. The private window avoided that extension attribute. Expected guest `/auth/me` 401 requests were observed there; they do not imply a failed authenticated flow.
- All active supplied brand PNGs were verified byte-identical to their source files. The active favicon uses `favicon-original.png`; see document 01 for the independently changed, preserved older path.
- No screen-reader acceptance, full-browser axe/contrast audit, completed protected-route visual acceptance, or all-width overflow pass is claimed.

## Historical visual gate — resolved by human sign-off

Browser control failed again in the v0.2 follow-up. Complete the exact 320, 375, 768, 1024 and 1440px route matrix using the [user inspection worksheet in Chrome](06-manual-human-review.md); do not repeat automated retries indefinitely. Inspect full-page overflow, keyboard focus and the mobile dialog in a real browser; review populated catalog/gallery/variant states and authorized account/admin/MFA states using isolated data. The current persistent catalog has no client products. A clearly labelled, read-only fixture was prepared in ignored runtime storage, excluded from the production build, but was not browser-reviewed. Do not seed fictitious products into `iranti_local` to complete design acceptance.

Client photography, licensed webfonts and final business copy remain separate content inputs. Their absence is documented and does not justify claiming unfinished browser checks as passing. The user’s subsequent human QA pass resolves this visual gate. Phase 3C.5 is **APPROVED AND CLOSED**; content inputs remain tracked for later delivery. Phase 3E is not authorized.
