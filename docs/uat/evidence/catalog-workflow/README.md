# Catalog workflow UAT evidence

Implementation and regression: 2026-09-25. Final Products visual recheck: 2026-09-27. Synthetic isolated QA data only; no real customer information or provider credentials. The Next.js development indicator is not a production control.

- [products desktop](products-desktop.png)
- [products mobile](products-mobile.png)
- [draft mobile](draft-mobile.png)
- [editor tablet](editor-tablet.png)
- [staff account](staff-account.png)
- [restore confirmation](restore-confirmation.png)

[Responsive results](responsive-results.json) cover Products, Add Product, Edit Product and Staff Account at 320, 375, 768, 1024 and 1440px. All twenty authenticated, loaded checks passed document overflow and axe WCAG 2 A/AA / 2.1 AA checks. [Final Products recheck](products-final-recheck.json) repeats all five widths after the admin thumbnail placeholder correction. Representative screenshots across all widths were visually inspected. Tables intentionally scroll inside their labelled regions.

Developer browser workflow passed: owner login/MFA → administration; sole configured treatment shown without a selector; name-only draft Save; disabled Publish for incomplete draft; Archive; Restore confirmation → editable Draft; dedicated Edit outside overflow; keyboard Space activation and Escape/focus return. The script's route/newline escaping failures were harness errors and are not counted as application failures or passing checks. Missing/multiple tax configuration and customer/all-staff redirects also have automated frontend/backend regression coverage; they are not claimed as separate manual browser scenarios.

## Client retest

Use the ordinary local frontend at `http://localhost:3000`, with existing record links rather than fixture IDs. Client acceptance is still pending.

1. Save a name-only draft with no configured tax setup. Confirm draft editing stays available while Publish explains actual missing requirements.
2. With an approved single treatment, confirm automatic assignment; with several approved treatments, confirm only business labels appear and no arbitrary value can be entered.
3. Configure the remaining product requirements and publish; verify the product row has Edit plus an ellipsis with state-valid secondary actions.
4. Archive, restore, and confirm Draft status, retained product/history/stock and no automatic storefront republication. Explicitly publish only after review.
5. Sign in as customer, owner, order-processing staff and inventory/store staff; verify customer `/account` versus staff `/admin`, required MFA and staff profile/security navigation.
6. Review at 320/375/768/1024/1440px and by keyboard. Record dated acceptance or defects in the UAT register.

This is developer verification, not human acceptance, screen-reader certification or external-provider validation. Actual tax treatment and launch content remain client inputs.
