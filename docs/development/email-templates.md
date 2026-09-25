# Transactional email templates

Phase 3K v1 — 2026-09-24. Twelve event templates use one reusable HTML layout and a text-only alternative; exact subjects/copy are in `NotificationContent::MATRIX`. See the [notification matrix](notification-matrix.md).

`resources/views/emails/transactional.blade.php` escapes every interpolated business value. The separate `transactional-text.blade.php` emits literal text, preserving ampersands and URLs without HTML entities; never reuse it as HTML. Delivery rows record template code/version `v1`. Future changes must preserve the v1 renderer for outstanding v1 intents or provide an explicit reviewed version migration; this is not a template CMS.

Supplied horizontal logo (unaltered proportions), #335438 green, #f4eee1 cream, #3c4142 charcoal, and an orange #b85a22 divider match the approved brand. Georgia/Times headings and Arial/Helvetica text avoid unsupported web fonts. A 600px maximum presentation table shrinks on narrow screens; items stack rather than forming a wide data grid. HTML contains one h1, descriptive h2 headings, logo alt text, meaningful text/links, no JavaScript/animation and no image-only message. CTA uses cream on green; orange is decorative, not low-contrast small text or a color-only status.

Order messages expose historical item quantities/prices, item tax, delivery tax, total, order/date/reference. Return emails show requested/approved quantities as relevant; refund emails separately label the historical refund amount and original order totals. No internal notes appear. Guest text explains original-browser access without embedding or renewing a capability. Account CTA still requires login/ownership. Remote images can be blocked without losing the written content.

## Development preview

From `backend`, safe synthetic data only, no database reads or external send:

```sh
FRONTEND_URL=http://localhost:3031 /opt/homebrew/bin/php artisan notifications:preview OrderCreated
FRONTEND_URL=http://localhost:3031 /opt/homebrew/bin/php artisan notifications:preview OrderShipped
FRONTEND_URL=http://localhost:3031 /opt/homebrew/bin/php artisan notifications:preview ReturnApproved
FRONTEND_URL=http://localhost:3031 /opt/homebrew/bin/php artisan notifications:preview RefundSucceeded
python3 -m http.server 3031 --bind 127.0.0.1 --directory storage/app/private/email-previews
```

Open `http://localhost:3031/OrderCreated.html` and its `.txt` alternative. Use any matrix event as the command argument. The directory is ignored/private storage, not a production route; the command refuses staging/production. Stop the preview server after use. Do not populate these files with customer data.

## Executed QA

On 2026-09-24, isolated Chrome rendered **all 12 templates at 320, 375, 768 and 1440px** (48 cases), using intentionally long order numbers, product names and tracking values. DOM checks found no horizontal overflow or broken/distorted logo. Axe WCAG 2 A/AA and 2.1 AA checks reported no violations across those cases. Tab reached the descriptive order link with browser focus outline; no modal/drawer exists. Automated HTML/plain-text tests cover all templates, escaping, safe links, historical amounts, guest behavior and sensitive-note exclusion.

Manual screenshot inspection: OrderCreated at 320px; OrderShipped at 1440px; ReturnApproved at 320px; RefundSucceeded at 1440px. Typography, item flow, references, spacing, logo proportions and CTA readability were inspected and passed in those screenshots. Do not interpret automated checks as manual inspection of every template/width.

Browser evidence is in ignored `.runtime/notifications-verification/visual-results.json` and representative PNGs. Browser rendering is **not** Gmail/Outlook/Apple Mail certification. Real mailbox rendering, dark mode, image blocking, mail-client zoom, screen-reader behavior and provider deliverability remain staging/UAT checks. Existing Identity reset templates are unchanged and were not visually recertified here.
