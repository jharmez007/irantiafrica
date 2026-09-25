# 20 — Privacy and audit
Trace: NFR03/14/15, FR-POL-001; Q20. Developer drafts notices; client/legal approves actual policy and retention before production. No legal compliance certification is implied.

| Data | Purpose / visibility | Retention decision |
|---|---|---|
| Name/email/password hash, verification/MFA data | Account/security; narrow identity access | Account lifecycle + approved retention; credentials/tokens cleared on expiry/revocation |
| Saved address/phone | Customer convenience; owner/customer and necessary fulfillment staff | Customer can remove current address; historical snapshots follow separate retention |
| Order contact/address/items/payment references | Fulfillment, customer access, reconciliation | Legal/business retention period requires approval; anonymize/minimize when permitted |
| Provider normalized metadata | Verify collection/refund | Store only required IDs/status/amount/channel, not card credentials/full payload |
| Return reason/evidence | Resolve claim | Restrict to owner/authorized operational staff; delete evidence on approved schedule |
| IP/user-agent/security events | Abuse investigation | Minimize/truncate or keyed-hash where useful; short retention proposal needs approval |
| Staff changes and inventory/refund ledger | Accountability and integrity | Append-only; access controlled; approved retention/legal holds |
| Carts/guest tokens/idempotency responses | Recover workflow/deduplicate | Short expiry configurable; purge tokens/PII payload promptly; financial uniqueness retained separately |

Audit event fields: event UUID, UTC occurred_at, actor user/service/guest pseudonymous ID, action, subject type/ID, sanitized before/after changes, reason/approval ID, outcome and request ID. Required events: admin login success/failure/MFA/recovery, product publication/price changes, opening stock/adjustments/restock, order transitions, return/refund decisions and outcomes, configuration changes, staff/permission changes, sensitive audit access and incident actions.

Audit and domain mutation are atomic for critical commands. Failed auth/security events are captured outside failed business transactions. Application role can append but not update/delete audit/movement rows; restricted retention job/DB administrator handles approved purge with its own audit. Database superuser can still tamper: restricted access plus separately protected audit exports improves evidence, not mathematical nonrepudiation.

Never log passwords, cookies, reset/guest/session tokens, full payment payloads, secret keys, PAN/CVV, full authorization URLs or unnecessary address/email bodies. Use opaque IDs and masked summaries. Access to logs/backups is privileged; metrics labels cannot contain PII or unbounded order IDs. Request bodies are not logged wholesale.

Account deletion/anonymization is an explicit reviewed workflow: revoke sessions/tokens, remove saved addresses, anonymize identity and eligible snapshots while retaining required financial integrity. Do not cascade-delete paid orders. Guest linkage to a later account needs proven order access, not an email match. Data export/access requests require identity verification and client-approved procedure; no speculative automated privacy portal.

Maintain data inventory and processor list for Paystack/email/hosting/storage/logistics. Share only necessary delivery data with logistics; no marketing list or analytics tracker is introduced. Backup retention delays erasure and must be disclosed/handled by approved policy. Exact retention periods, legal holds, consent text and operator roles are production gates; regulated requirements that materially change architecture require ADR/change review earlier.
