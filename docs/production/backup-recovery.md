# Backup and recovery

**Local drill: RESTORE VERIFIED — 2026-09-24.** PostgreSQL 18 custom-format dump of the isolated representative database restored into a newly created disposable database. All54 tables /4,858 rows matched table counts and SHA256 content fingerprints; migration status exited0 with no pending migrations. Dump630,728 bytes; backup/restore/integrity comparison1.66 s locally. Restore database deleted after verification. This is not evidence of production PITR, remote encryption, media restoration or key-custodian recovery.

Production strategy remains an unactivated gate: managed encrypted daily full backups + continuous WAL/PITR, separate privileged backup identity, immutable/independent backup retention where supported, backup-success monitoring and quarterly restore drills. Proposed30 day recovery window, RPO≤15 min and RTO≤4 h are **ENGINEERING RECOMMENDATIONS**, not approved SLAs. Client approves cost/region/retention; technical recovery custodian operates and tests; name primary/backup custodians before launch. Application role cannot administer/delete backups.

## Drill procedure

Use a restricted restore network and a new database owned by a non-superuser migration role. Inject credentials via secret manager or mode0600 `.pgpass`; never command arguments or logs. Example commands use placeholder service names configured privately in `pg_service.conf`:

```sh
umask 077
pg_dump 'service=iranti_backup_source' --format=custom --no-owner --no-acl --file=isolated-backup.dump
# Operator creates a NEW isolated target; never overwrite a retained database.
pg_restore --dbname='service=iranti_restore_target' --exit-on-error --no-owner --no-acl isolated-backup.dump
# Configure the restored application's isolated environment; disable external side effects.
php artisan migrate:status
php artisan app:readiness
```

Before opening writes: compare table counts and financial sums; validate inventory ledger/on-hand/reserved and reservation/order links; compare historical item/refund snapshots; run application checks; check constraints and migration version; record elapsed time and recovery boundary. Restore encrypted APP_KEY history through separate custodian process; lost keys can make MFA/notification data unrecoverable. Do not run migrate:fresh on a restore that needs investigation.

Reconcile **all Paystack payments/refunds since the chosen recovery point**, including references absent from restored DB. UNKNOWN refunds and ambiguous emails cannot be blindly replayed. Restore/reconcile object versions against DB metadata, replay bounded inbox/outbox orchestration, expire eligible holds, then business+technical owner approve reopening. Record actual observed RPO/RTO and corrective work.

## Object storage

S3 compatibility is not backup. Enable provider versioning, approved lifecycle/retention and protection against application deletion of historical versions. Preserve originals, ready derivatives and metadata; consider independent original-object export where budget/risk warrants. Use separate backup privileges. DB point-in-time recovery may reference deleted/newer objects; retain keys long enough for recovery and test missing-derivative regeneration. Actual selected provider/versioning/encryption/cross-account recovery remains NOT VERIFIED.

## Least privilege

Production runtime role: LOGIN, no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION, connect only application DB; USAGE on app schema, required SELECT/INSERT/UPDATE/DELETE and sequences only. Migration owner is a separate time-bound identity with schema DDL; application role must not own tables or disable triggers. Revoke public schema CREATE; set default grants for future migration-created tables. Audit ledger updates remain constrained by existing triggers; privileged database administrators are a residual threat requiring access logging and protected audit export. Backup identity has read/backup permissions, restore operator owns only isolated recovery target. Validate grants with negative DDL/foreign-database tests in staging before launch.
