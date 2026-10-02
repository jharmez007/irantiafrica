# Admin shell client retest evidence

2026-09-25. Developer Chrome checks with synthetic isolated test data; client acceptance remains pending. Screenshots contain no real customer data, credentials or provider payloads. The Next.js development indicator is a development-only overlay.

- [dashboard desktop](dashboard-desktop.png)
- [products mobile](products-mobile.png)
- [products desktop](products-desktop.png)
- [product create mobile](product-create-mobile.png)
- [product media desktop](product-media-desktop.png)
- [inventory tablet](inventory-tablet.png)
- [mobile drawer](mobile-drawer.png)
- [staff desktop](staff-desktop.png)
- [orders desktop](orders-desktop.png)
- [payments desktop](payments-desktop.png)
- [returns desktop](returns-desktop.png)
- [categories desktop](categories-desktop.png)

[Responsive results](responsive-results.json): 12 routes at 320, 375, 768, 1024 and 1440px; final inventory sizing recheck replaces that route's earlier measurements. All checks authenticated and loaded. No full-page overflow and no detected axe WCAG 2 A/AA or 2.1 AA violations. Tables intentionally scroll within their region. Representative screenshots were visually inspected; this is not a claim of full manual inspection of every pixel in 60 captures.

[Keyboard results](keyboard-results.json): drawer focus/Tab/Escape/return, visible focus, collapse persistence, reduced motion, 200% CSS zoom and media containment. The last pass includes explicit forward/reverse drawer boundary wrapping. This is not full WCAG certification or a physical-device/screen-reader test.

## Client retest

Use the normal local frontend at `http://localhost:3000` and actual existing record links. The isolated synthetic database IDs shown in screenshots are not portable.

1. Sign in as owner, complete MFA and navigate every permitted sidebar destination.
2. Create/edit/publish a product; check variants, pricing and image processing, then adjust stock and review history.
3. Open order/fulfilment details, payment history, a return review and the Staff invitation dialog. Confirm sensitive-action reauthentication.
4. Return to Dashboard; verify Reports and Notifications. Test restricted staff navigation and direct access using approved roles.
5. Repeat mobile navigation at 320/375/768px and desktop at 1024/1440px. Check keyboard navigation, drawer close/focus return, collapse persistence, readable tables/forms and 200% zoom.
6. Record dated business acceptance or remaining defects in the Phase 3N defect register. Actual invitation inbox/provider delivery remains a separate unverified gate.
