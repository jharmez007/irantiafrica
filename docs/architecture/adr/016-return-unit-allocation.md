# ADR-016 — Historical return units and safe refund creation

Date: 2026-09-24. Status: implemented for Phase 3J review; not independently approved.

The Phase 3J instruction explicitly authorizes partial quantities/refunds while preserving the Phase 3F deterministic per-unit tax allocation. The earlier conceptual return tables did not identify which historical units each concurrent claim consumes. Migration 000013 adds `return_units`: numbered order-item units, exact historical price/tax, and unique active claims. Rejected/unapproved claims release units; approved claims retain them. Deferred constraints tie counts to requested/approved quantities. This makes overlapping claims and kobo allocation enforceable across multiple returns.

The phase uses a narrow immutable `return_policies` table instead of implementing unrelated privacy/terms policy storage. No production clock/receipt semantics are inferred. Its default is unconfigured; the explicit development example is not business approval. Existing return states/dispositions and RBAC are retained. Reason codes use the Phase 3J instruction's stable names. Return/refund state remains separate from core fulfilment status.

Paystack creation does not document an idempotent replay contract. One immutable provider creation intent per approved refund is committed before network I/O, with no blind POST retry. A lost response reserves budget until a fresh server GET proves the provider identity/outcome. One-to-one attempt evidence plus append-only observations replaces a speculative retry loop. A failed-refund resubmission workflow requires a later reviewed extension; automatic reapproval of the same return is not provided.

No reverse logistics, exchanges, support tickets or Phase 3K notification delivery are introduced.
