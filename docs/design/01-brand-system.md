# 01 — IRANTI Africa brand system

Phase 3C.5 — Brand Identity & UI Design System. Baseline date: 2026-09-23.

This phase refines presentation and interaction around the approved frontend. It does not authorize cart, checkout, orders, payments, shipping, returns, inventory business rules, promotions or reporting. Existing authentication, MFA, RBAC, catalog contracts and availability semantics remain authoritative.

## Source assets and placement

The supplied brand document is retained at [assets/brand-document.png](assets/brand-document.png). It names the four approved colors and the typefaces **TAN — Angleton** and **Sukhumvit Set**. The client-supplied artwork is the source of truth; frontend components reuse it rather than recreating its lettering or mark.

| Supplied asset        | Repository asset                                    | Intended use                                                                         |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Horizontal Logo Combo | `frontend/public/assets/brand/horizontal-logo.png`  | Desktop storefront header and other horizontal navigation contexts                   |
| Vertical Logo Combo   | `frontend/public/assets/brand/vertical-logo.png`    | Editorial, authentication and footer contexts where the full lockup remains readable |
| Primary Logo          | `frontend/public/assets/brand/primary-logo.png`     | Primary identity treatment where the supplied artwork suits the available space      |
| Secondary Logo        | `frontend/public/assets/brand/secondary-logo.png`   | Secondary identity treatment without modifying the supplied artwork                  |
| Favicon               | `frontend/public/assets/brand/favicon-original.png` | Browser icon and compact brand-mark contexts                                         |
| Brand Document        | `docs/design/assets/brand-document.png`             | Design reference; not customer-facing page content                                   |

The active logo/icon PNGs are byte-for-byte copies of the supplied originals and have a 501 × 501-pixel canvas. The separately named `favicon-original.png` is the active icon: during verification, the existing `favicon.png` was found changed independently to 226 × 226 JPEG data. That file was preserved without reuse or overwrite; the application points to the verified original PNG. Their canvas dimensions do not describe the proportions of the artwork within it. The brand document is 1231 × 886 pixels. Preserve artwork proportions, colors and lettering; use intrinsic image dimensions and contain sizing. Do not stretch a square source to make a horizontal lockup, crop visible artwork, apply a recoloring filter or replace the mark with a typographic approximation. Any presentation adjustment to surrounding canvas whitespace must leave the complete artwork visible.

The shared `Logo` component maps its `horizontal`, `vertical`, `primary`, `secondary` and `mark` variants to these existing assets. A linked logo identifies the home destination; repeated purely decorative identity art should not create redundant announcements. Review mark readability at its actual small-screen and favicon sizes.

The supplied files are reused under the user's explicit instruction. This is not evidence of a transferable font license or authorization to source additional third-party artwork. Preserve the original supplied files; do not add external product photographs or scraped reference-site assets.

## Approved palette and semantic roles

The implementation defines palette primitives and semantic aliases in `frontend/src/app/globals.css`:

| Semantic token    | Palette primitive / resolved value  | Use                                                                          |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `--primary`       | `--color-green`: `#335438`          | Primary actions, headings and brand-green surfaces                           |
| `--accent`        | `--color-orange`: `#B85A22`         | Restrained decorative emphasis and approved accent treatments                |
| `--background`    | `--color-cream`: `#F4EEE1`          | Warm cream page background                                                   |
| `--text`          | `--color-charcoal`: `#3C4142`       | Body text, labels and operational content                                    |
| `--surface`       | `--color-white`: `#FFFFFF`          | Sparing neutral surfaces                                                     |
| `--success`       | `--color-green`: `#335438`          | Confirmed success, accompanied by meaningful text                            |
| `--error`         | `--color-charcoal`: `#3C4142`       | Error/destructive treatment with explicit icon, wording and structure        |
| `--text-muted`    | `#616462`                           | Neutral supporting text; measured at 5.1785:1 on cream                       |
| `--border`        | `--color-charcoal`: `#3C4142`       | Visible form-control boundaries                                              |
| `--border-subtle` | 22% charcoal mixed with transparent | Nonessential dividers and surface rules; not the sole indicator of a control |

Use shared tokens and component variants rather than repeating raw colors in pages. A neutral tint is a mixture of the approved palette, not a new unrelated brand color. Do not use orange for destructive actions or errors. Error meaning comes from the message, icon, field association and border treatment; success/error distinction must remain understandable without color.

Charcoal or green text on cream provides strong contrast. Orange text on cream measures **4.0153:1** and is unsuitable for normal-size text. Orange with white measures **4.6423:1**, which passes AA normal-text contrast; cream with orange does not. Reserve orange-on-cream for decorative elements or text that actually qualifies as large. Use green focus indicators on light surfaces and a light indicator on green surfaces. Full measured evidence appears in [05 — Responsive design and accessibility](05-responsive-accessibility.md).

## Typography and licensing decision

A repository scan found no Angleton or Sukhumvit Set font binaries or matching font-license evidence in source assets. No font has been downloaded, invented, copied from the operating system or embedded for this phase. The brand document names preferred typefaces but does not supply redistribution rights.

The implemented stacks retain preferred family names for visitors who already have those fonts locally, followed by the actual fallbacks:

```css
--font-display: "TAN - Angleton", Georgia, "Times New Roman", serif;

--font-body:
  "Sukhumvit Set", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial,
  sans-serif;
```

Georgia supplies a familiar editorial serif character, but it is not represented as an exact visual or metric match for Angleton. The supporting sans stack favors readable native rendering and avoids a third-party font request. A CSS family name can use a font already installed on the visitor's device; it does not include that font in the application.

The exact brand fonts can replace these fallbacks only after the client supplies suitable webfont files and evidence permitting the intended web use. Recheck line wrapping, control widths, loading behavior and contrast after that substitution.

Use a deliberate hierarchy: display and H1 for the primary editorial statement; H2/H3 for sections; body for descriptions and forms; small/caption for supporting information; labels/buttons for controls. Headings should retain useful semantic order independently of their visual size. Favor moderate responsive sizes, comfortable line height and bounded prose widths rather than very large display text. Do not shrink labels, prices or error messages to accommodate a crowded layout.

| Type role / token                           | Implemented base scale                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Display and page H1                         | Display stack; base H1 `clamp(2.5rem, 5vw, 4.5rem)` with page-specific editorial adjustments        |
| H2                                          | Display stack; base `clamp(2rem, 3.5vw, 3.2rem)`                                                    |
| H3                                          | Supporting stack by default; `1.15rem`, weight 500; product/category headings use the display stack |
| Body / `--text-base`                        | `1rem`, body line height 1.6                                                                        |
| Larger support / `--text-lg`                | `1.125rem`                                                                                          |
| Small, button and form labels / `--text-sm` | `0.875rem`                                                                                          |
| Caption / `--text-xs`                       | `0.75rem`; small editorial kickers have dedicated styles                                            |

Rem-based values follow the visitor's root text size. Screen-specific editorial overrides still require the responsive review in document 05; a declared scale alone does not prove readable layout.

## Composition, spacing and motion

Storefront pages use warm surfaces, generous section spacing, image-led product presentation and restrained rules. Authentication combines an editorial identity panel with a clear form panel at larger widths and simplifies to one column on mobile. Admin pages prioritize readable operational tables, forms and navigation on neutral surfaces with green accents.

Use the shared spacing scale for page gutters, control gaps, field groups and section rhythm:

| Token        | Value     |
| ------------ | --------- |
| `--space-1`  | `0.25rem` |
| `--space-2`  | `0.5rem`  |
| `--space-3`  | `0.75rem` |
| `--space-4`  | `1rem`    |
| `--space-6`  | `1.5rem`  |
| `--space-8`  | `2rem`    |
| `--space-12` | `3rem`    |
| `--space-16` | `4rem`    |
| `--space-24` | `6rem`    |

`--content-width` bounds content at 1320px. The shared container leaves 5rem total horizontal space by default, 3rem at widths up to 1100px and 2rem up to 600px. Layout-specific inner spacing remains within that page boundary.

The radius scale is small `--radius-sm: 2px`, medium `--radius-md: 4px` and large `--radius-lg: 8px`; large is reserved for exceptional grouped surfaces rather than every card. Controls primarily use the small radius. `--shadow-dialog: 0 12px 48px #3c414226` is a restrained charcoal dialog shadow. Spacing, typography and rules carry the normal hierarchy. Product imagery and supplied logos retain their aspect ratios. Development photography placeholders must be identifiable as placeholders and must not imply real stock or unverified product claims.

Motion uses `--duration: 160ms` and `--ease: ease-out` for standard control transitions, with a 240ms product-image hover transition and 1.5-second skeleton breathing effect. `prefers-reduced-motion: reduce` disables transitions/animation and restores automatic scrolling. Essential content never depends on animation. There is no default hero carousel, dramatic page transition, promotional discount claim or newsletter signup introduced by this design phase.

## Inspiration and content boundaries

The following primary sites were read on 2026-09-23 for high-level direction. These observations concern content structure, not reproduction of their proprietary design or a claim that screenshots were audited.

- [K | KASA](https://k-kasa.com/) places collection discovery and concise editorial storytelling alongside a separate brand/founder narrative. The transferable principle is to give merchandising and brand context distinct, readable sections.
- [Mint Organic Care](https://www.mintorganiccare.com/) organizes discovery through categories and visible NGN prices. Iranti can apply that clarity while retaining its own approved taxonomy and content.
- [Beguile](https://beguile.com/) presents a focused assortment with explicit product-state text and a separate discovery section. Use readable availability messaging only where Iranti's existing data supports it.
- [K | KASA](https://k-kasa.com/) and [Beguile](https://beguile.com/) group footer destinations by shopping, help and company/policy purposes. Iranti's destinations must correspond to its actual routes or visibly pending configuration.

Do not transfer reference-site wording, photography, logos, discounts, reviews, sustainability claims, delivery promises, medical claims or payment assurances. The supplied identity's “Memories of Nigeria” wording is brand material; additional manufacturing, provenance or product claims still require client content. Contact details, social destinations, policies, final photography and richer brand storytelling remain client inputs where not yet supplied.
