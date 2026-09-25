# 17 — RBAC
**RBAC MATRIX: APPROVED FOR V1 — client decision, 2026-09-21.**

Trace: FR-ADM-001/002, FR-INV-001, FR-RET-004, NFR15; Q13. Role names and owner stock/refund responsibilities are confirmed; exact grants below are now approved. “Yes” remains subject to object/state policy and least-data exposure.

| Permission | Owner / Super Admin | Order Processing | Inventory / Store |
|---|---|---|---|
| catalog.read_internal | Yes | Yes | Yes |
| catalog.create_update | Yes | No | No |
| catalog.publish_archive | Yes | No | No |
| media.manage | Yes | No | No |
| inventory.read | Yes | Yes (availability only) | Yes |
| inventory.adjust | Yes | No | No — owner initially updates |
| inventory.movements.read | Yes | No | Yes, redacted actor details |
| orders.read | Yes | Yes, operational fields | No |
| orders.prepare | Yes | Yes | No |
| shipments.record / delivery.record | Yes | Yes | No |
| orders.cancel | Yes, approved policy only | No | No |
| payments.read_summary | Yes | Yes (paid/pending only) | No |
| payments.reconcile / exceptions.resolve | Yes | No | No |
| returns.read / review | Yes | Read/intake only | No |
| returns.decide | Yes | No | No |
| refunds.approve / submit | Yes + recent auth | No | No |
| reports.sales / reports.products | Yes | No | No |
| reports.orders | Yes | Yes | No |
| reports.stock | Yes | No | Yes |
| customers.read_operational | Yes | Only within assigned order work | No |
| tax.configure / shipping.configure | Yes | No | No |
| staff.provision / roles.assign | Yes + recent auth | No | No |
| audit.read | Yes | No | No |
| security.configure | Yes + recent auth | No | No |

No blanket is_admin flag, wildcard policy bypass or UI-only checks. Permissions are explicit seeded identifiers reviewed in code; role grants are audited and protected from mass assignment. Super Admin is the business owner role, not database superuser. Prevent removal of last active owner and self-escalation by non-owner. Bootstrap owner through a one-time audited deployment procedure, never a public seed password.

Customer access uses resource ownership, not these staff grants. Guests get only scoped capability permissions. API list queries enforce authorization before pagination, and exports (if later approved) require separate data-access review. Staff sees minimum address/contact needed for fulfillment; inventory users do not gain customer PII by indirect joins.

Service identities (worker, scheduler, deployment) are separate from business roles, with limited infrastructure credentials. Automated refund submission requires an existing owner approval record and amount snapshot; workers cannot invent approval. Test every denied cell, object-level horizontal access and role revocation mid-session. The client approved this matrix and required staff TOTP MFA on 2026-09-21. Customer MFA is not required for V1. [ADR-012](adr/012-staff-mfa.md) records enforcement and recovery.
