# Phase 3N Product Management UX flow proposal

Version 1.0 — 2026-09-27. Prepared before implementation for UAT remediation. Approved catalog, tax, stock and publication rules remain authoritative; Phase 3O is out of scope.

The existing journey is Products → Add Product → General draft save → Pricing/Variants → Media → generic Inventory search → status panel → Publish. Name-only drafts already work, but the editor mixes tax setup with business details, calls a simple product's price record a “variant,” repeats variant summary and edit controls, exposes numeric image order/status, and offers no product return path from Inventory. Publication requires a current configured tax category, description, active category, ready image and complete active SKU/price. Stock is not a publication guard, although positive available stock controls browse/search visibility. The lack of a local current checkout bundle causes the reported tax-readiness blocker.

Proposed owner flow:

1. **Details:** name, description, category and Simple product / Product with variants. Save an incomplete draft and continue to pricing. Move tax choice/status into **More settings**, shown normally only if multiple current configured choices or an existing mismatch needs review.
2. **Pricing & Variants:** one SKU/NGN price form for a simple product. For a variant product, add named options and comma-separated values, then create the combinations the owner actually sells using the existing guarded variant API. Show a readable variant table rather than raw associations.
3. **Images:** one upload area with local preview and plain image description; automatically poll existing processing status. Gallery cards show the first image as primary, actionable status only, and an overflow for edit description, move/reorder and remove. Existing media position and retirement APIs remain authoritative.
4. **Inventory:** show current stock and a contextual Manage inventory link carrying the exact product/variant. Inventory offers a Back to product link and prefilters the relevant record.
5. **Review and publish:** show concise backend-derived readiness items and a separate stock-availability note. Keep Save, Publish and destructive Archive visually distinct. Publishing still calls the normal guarded API; restoring returns only to Draft.

For local development, offer an explicit non-production command that publishes a complete `development_only` checkout configuration through the existing immutable service, using a single `STANDARD` category labelled “Standard tax treatment.” Its sample rate and delivery settings must be labelled **DEVELOPMENT / TEST ONLY — NOT PRODUCTION TAX POLICY**. The existing single-choice catalog default then assigns it to new/unassigned drafts. No production seeding, tax bypass or implicit rate fallback is proposed.
