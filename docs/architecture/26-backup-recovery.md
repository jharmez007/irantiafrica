# 26 — Backup and disaster recovery
**ENGINEERING RECOMMENDATIONS — Q19/Q22 APPROVAL REQUIRED.** Trace: NFR07. Proposed RPO ≤15 minutes and RTO ≤4 hours, quarterly restore drill; not a client-approved SLA or proven capability.

Managed PostgreSQL should provide encrypted automated full backups plus continuous WAL/PITR sufficient for the target. Verify actual retention, region, restore granularity, export capability, access boundaries and provider contractual guarantees before procurement. Propose 30-day recovery window subject to retention/cost approval; backup success monitoring and periodic restore are mandatory. Application credentials cannot delete backups.

Object storage: enable versioning/recovery retention where supported and cost-approved; protect originals and ready derivatives/metadata. Separate privileged credentials from application writer; replicate/export critical originals if required by risk review. DB point-in-time restoration may reference newer/missing objects: retain old keys and reconcile before reopening. Redis need not restore commerce truth; reconstruct queues from DB.

Configuration backup includes versioned infrastructure/release manifests, environment variable **names**, provider/DNS settings and encrypted secret-manager recovery process. Never commit secret values or unencrypted environment dumps. Securely retain required application encryption keys and rotation history; without keys encrypted MFA/config data may be unrecoverable. Two named custodians/recovery-access procedure recommended.

## Restore runbook design
1. Incident lead stops risky writes/payment initialization, preserves forensic data, records incident and chosen recovery time.
2. Restore DB into isolated network from backup/PITR; restore keys/config through approved secret process, not developer laptop dumps.
3. Validate constraints, counts, financial sums, inventory ledger/balances, active reservations and order snapshots.
4. Reconcile object references and missing derivatives; restore storage versions as needed.
5. Reconcile **all provider payments/refunds since recovery point**, including operations the restored DB forgot. Quarantine unknown references; do not blindly resend refunds/mail.
6. Rebuild queue work from outbox/inbox; expire/review stale reservations with controlled jobs. Reconcile email outcomes where possible.
7. Smoke-test authenticated access/authorization/cart/checkout in isolation with external side effects disabled.
8. Business/technical owner approves reopening, monitors reconciliation, records actual RPO/RTO and corrective work.

Test loss of DB, accidental deletion, corrupted media, unavailable key and Redis loss. Quarterly drill restores into isolated non-production with outgoing email/payments disabled and access to production PII tightly limited. Document measured recovery duration and data-loss boundary. Backup retention and legal hold must align with privacy policy; disaster recovery is not a substitute for incident prevention.
