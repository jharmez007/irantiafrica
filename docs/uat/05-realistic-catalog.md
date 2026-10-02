# Realistic local UAT catalogue

**Phase 3N — 2026-10-02. LOCAL / DEVELOPMENT / UAT DATA ONLY. NOT APPROVED PRODUCTION CATALOGUE CONTENT.**

The canonical machine-readable copy is [`backend/database/uat/catalog.json`](../../backend/database/uat/catalog.json). It contains the representative descriptions, human-readable image alt text, exact SKU and integer-kobo price, option value and stock for each product. The images come only from [`catalog-images/`](catalog-images/) and are generated UAT assets, not client-approved final photography.

## Safety and commands

From `backend/`:

```bash
/opt/homebrew/bin/php artisan iranti:seed-uat-catalog --dry-run
/opt/homebrew/bin/php artisan iranti:seed-uat-catalog
# For an explicit non-interactive local run:
/opt/homebrew/bin/php artisan iranti:seed-uat-catalog --yes
```

The command refuses anything except `APP_ENV=local`, loopback PostgreSQL on port 5432 with actual database `iranti_local`, and private local catalog storage. It verifies the active development-only `STANDARD` tax treatment, checks all 30 image hashes against the manifest, and rejects unknown active/draft products or categories. It never runs on boot, migration or production deploy. Interactive use asks for confirmation; `--yes` is an explicit alternative. It resumes matching products without duplicating categories, variants, media, stock or publication. It refuses conflicting existing product data. Existing stock balances are retained if UAT transactions have changed them.

After all 30 target products publish, the command archives only four known pre-existing development products (`phase-3n-uat-sample-2026-09-27`, `plate`, `pot`, `spoon`) through the catalog action, and archives the old `plate` category. It performs no hard deletion or business-history reset. Do not run `migrate:fresh` or truncate catalog tables. There is no automatic reset command.

## Catalogue

Six active categories contain **30 published products: 21 simple and 9 variant**, with **42 unique SKUs**. Prices below are in NGN; the backend stores integer kobo. `—` means a simple product with one SKU.

| # | Category | Product | Option | Value → SKU · Price · Opening stock | Image file |
|---:|---|---|---|---|---|
| 1 | Home Décor | Heritage Woven Cushion | Colour | Forest Green → `IRA-HDC-HWC-GRN` · ₦24,500 · 18<br>Terracotta → `IRA-HDC-HWC-TER` · ₦24,500 · 12<br>Cream → `IRA-HDC-HWC-CRM` · ₦24,500 · 4 | `earthy_geometric_mudcloth_throw_pillow.png` |
| 2 | Home Décor | Adire Accent Cushion | — | `IRA-HDC-AAC-001` · ₦22,000 · 14 | `artisanal_forest_green_mudcloth_pillow.png` |
| 3 | Home Décor | Oyo Abstract Art Print | — | `IRA-HDC-OAP-001` · ₦38,000 · 8 | `iranti_africa_abstract_art_display.png` |
| 4 | Home Décor | Woven Wall Basket | — | `IRA-HDC-WWB-001` · ₦29,500 · 10 | `handwoven_terracotta_and_green_wall_basket.png` |
| 5 | Home Décor | Sculptural Ceramic Vase | Colour | Cream → `IRA-HDC-SCV-CRM` · ₦31,000 · 7<br>Terracotta → `IRA-HDC-SCV-TER` · ₦31,000 · 3 | `earthy_botanical_ceramic_vase.png` |
| 6 | Home Décor | Olive Heritage Throw | — | `IRA-HDC-OHT-001` · ₦36,000 · 9 | `earthy_woven_throw_with_olive_accents.png` |
| 7 | Home Décor | Sculptural Brass Candlestick Set | — | `IRA-HDC-BCS-001` · ₦32,500 · 6 | `warm_brass_candlelight_still_life.png` |
| 8 | Home Décor | Woven Abstract Wall Art | — | `IRA-HDC-WAA-001` · ₦42,000 · 5 | `earthy_geometric_woven_wall_art.png` |
| 9 | Home Décor | Botanical Ceramic Planter | Size | Small → `IRA-HDC-BCP-S` · ₦18,500 · 16<br>Medium → `IRA-HDC-BCP-M` · ₦23,500 · 10<br>Large → `IRA-HDC-BCP-L` · ₦29,500 · 2 | `speckled_terracotta_botanical_planter.png` |
| 10 | Table & Kitchen | Artisan Mug Set | — | `IRA-TBL-MUG-001` · ₦28,000 · 21 | `artisanal_iranti_mug_set_with_packaging.png` |
| 11 | Table & Kitchen | Acacia Serving Bowl Set | — | `IRA-TBL-ASB-001` · ₦42,500 · 11 | `iranti_africa_wooden_bowl_set.png` |
| 12 | Table & Kitchen | Woven Coaster Set | — | `IRA-TBL-WCS-001` · ₦16,500 · 24 | `iranti_africa_woven_coasters.png` |
| 13 | Table & Kitchen | Heritage Table Runner | — | `IRA-TBL-HTR-001` · ₦27,500 · 13 | `earthy_geometric_woven_runner.png` |
| 14 | Table & Kitchen | Carved Serving Tray | — | `IRA-TBL-CST-001` · ₦35,000 · 10 | `warm_carved_wooden_serving_tray.png` |
| 15 | Table & Kitchen | Acacia Salad Bowl Set | — | `IRA-TBL-ALS-001` · ₦46,500 · 7 | `warm_acacia_wooden_salad_bowl_set.png` |
| 16 | Table & Kitchen | Heritage Placemats Set | — | `IRA-TBL-HPM-001` · ₦22,500 · 19 | `woven_earth_tone_placemat_stack.png` |
| 17 | Table & Kitchen | Stoneware Dinner Plate Set | Set Size | 4 Piece → `IRA-TBL-SDP-4PC` · ₦36,000 · 15<br>6 Piece → `IRA-TBL-SDP-6PC` · ₦49,500 · 5 | `earthy_stoneware_plates_in_sunlit_simplicity.png` |
| 18 | Baskets & Storage | Seagrass Storage Basket | — | `IRA-BSK-SSB-001` · ₦32,000 · 17 | `handwoven_seagrass_basket_with_leather_handles.png` |
| 19 | Baskets & Storage | Lidded Woven Basket | — | `IRA-BSK-LWB-001` · ₦36,500 · 8 | `artisanal_woven_basket_with_colorful_lid.png` |
| 20 | Baskets & Storage | Heritage Laundry Hamper | — | `IRA-BSK-HLH-001` · ₦45,000 · 4 | `woven_olive_tan_storage_basket.png` |
| 21 | Baskets & Storage | Small Desk Basket | — | `IRA-BSK-SDB-001` · ₦18,500 · 30 | `woven_natural_fiber_desk_organizer.png` |
| 22 | Baskets & Storage | Striped Floor Basket | — | `IRA-BSK-SFB-001` · ₦38,500 · 0 | `striped_woven_fiber_basket_in_sunlit_interior.png` |
| 23 | Bags & Accessories | Market Tote | Size | Small → `IRA-BAG-MKT-S` · ₦29,500 · 12<br>Large → `IRA-BAG-MKT-L` · ₦34,500 · 7 | `woven_iranti_africa_market_tote.png` |
| 24 | Bags & Accessories | Mini Woven Tote | — | `IRA-BAG-MWT-001` · ₦27,000 · 11 | `woven_raffia_mini_tote_in_olive_and_green.png` |
| 25 | Bags & Accessories | Raffia Clutch | — | `IRA-BAG-RFC-001` · ₦23,500 · 14 | `woven_raffia_clutch_with_brass_clasp.png` |
| 26 | Bags & Accessories | Leather Crossbody Pouch | Colour | Cognac → `IRA-BAG-LCP-COG` · ₦39,000 · 6<br>Forest Green → `IRA-BAG-LCP-GRN` · ₦39,000 · 0 | `cognac_leather_crossbody_with_olive_accents.png` |
| 27 | Bags & Accessories | Leather Laptop Sleeve | Laptop Size | 13-inch → `IRA-BAG-LLS-13` · ₦33,000 · 9<br>14-inch → `IRA-BAG-LLS-14` · ₦35,000 · 5<br>15-inch → `IRA-BAG-LLS-15` · ₦37,500 · 2 | `cognac_leather_laptop_sleeve.png` |
| 28 | Candles & Fragrance | Wild Neroli Candle | Size | 250g → `IRA-CND-WNC-250` · ₦19,500 · 22<br>400g → `IRA-CND-WNC-400` · ₦27,500 · 8 | `iranti_wild_neroli_ceramic_candle.png` |
| 29 | Candles & Fragrance | Ceramic Incense Holder Set | — | `IRA-CND-CIH-001` · ₦17,500 · 16 | `boho_ceramic_incense_holder_still_life.png` |
| 30 | Stationery & Gifts | Leather Heritage Journal | Paper Size | A5 → `IRA-GFT-LHJ-A5` · ₦26,500 · 20<br>A4 → `IRA-GFT-LHJ-A4` · ₦32,500 · 6 | `iranti_africa_leather_journal.png` |

Category counts: Home Décor 9; Table & Kitchen 8; Baskets & Storage 5; Bags & Accessories 5; Candles & Fragrance 2; Stationery & Gifts 1. All 30 are published. The approved availability rule shows **29** in public browse/search because Striped Floor Basket has zero stock; its informational detail page remains available. Leather Crossbody Pouch stays listed with Cognac available and Forest Green unavailable.

## Inventory and media semantics

Each of the 42 SKUs has an inventory balance with zero reserved units. The inventory service recorded 42 `OPENING` movements. Its approved rule requires a positive opening movement, so each of the two intentionally zero-stock SKUs has an atomic +1 `OPENING` and −1 `ADJUSTMENT`; final on-hand is exactly zero. No balance or reserved quantity was written directly. Reruns do not reset balances or reproduce movements.

The local importer checks source path, checksum, size, MIME, dimensions and alt text; uses the existing private `MediaStorage` disk and `ProcessProductImage` job; and requires the job to produce `ready` derivatives before publication. It does not mark media ready in SQL. All 30 mapped images were ready after import, had meaningful alt text, and had their 320/640/1280 derivatives present. Product cards use `object-fit: cover`; off-screen lazy-loaded images may appear as placeholders in a full-page screenshot until scrolled into view.

**DEVELOPMENT/UAT TAX CONFIGURATION ONLY — NOT PRODUCTION TAX POLICY.** The existing local configuration supplies `STANDARD`; its sample rates and delivery rules are not client-approved production values.

## UAT observations and limits

- Browser checks covered `/`, `/products`, `/categories/home-decor`, `/products/botanical-ceramic-planter`, `/products/striped-floor-basket`, and `/search?q=woven` at 320, 375, 768, 1024 and 1440 pixels. No horizontal overflow was observed. The desktop grid, mobile filters, responsive cards, representative details and visible images were inspected. Category filtering, ascending price sorting and page 2 navigation worked.
- Search yielded relevant results for `woven` (6), `ceramic` (3), `basket` (4), `leather` (3), `candle` (1), and `heritage` (6). Public category listing for Baskets & Storage contains four available products; its fifth published product is the informational out-of-stock detail.
- The owner admin browser showed products, six active categories plus one archived legacy category, stock balances, and dashboard metrics. The dashboard correctly has zero revenue/orders because no transaction records were fabricated.
- **Low-stock UAT remediation (2026-10-02):** the audited inventory service configured all 42 catalogue balances to the representative five-unit threshold without changing on-hand or reserved stock. The dashboard now reports eight positive low-stock variants (2–5 available), two out-of-stock variants (zero available), and 32 normal-stock variants. Zero stock is not double-counted as low stock. The value **5 is DEVELOPMENT/UAT CONFIGURATION ONLY**, read from `INVENTORY_LOW_STOCK_THRESHOLD` (local default 5); the production threshold requires owner approval. See [`02-defect-register.md`](02-defect-register.md).
- Generated imagery has a consistent warm, earthy palette; a few product visuals repeat similar motif/staging. Client photography, product facts, price and availability approval remain outstanding before production use.

Phase 3N remains **OPEN**. This local population is not client acceptance, staging deployment, external payment/email verification, or Phase 3O.
