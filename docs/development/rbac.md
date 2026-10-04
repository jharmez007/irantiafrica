# RBAC — approved Phase 3B implementation
Date: 2026-09-21. **RBAC Matrix: APPROVED FOR V1. MFA: APPROVED FOR STAFF V1. Customer MFA: NOT REQUIRED FOR V1.**

## Roles and explicit grants
[Architecture 17](../architecture/17-rbac.md) is authoritative. The client approved its Phase 3B matrix and explicitly revised Inventory / Store Staff stock operations during Phase 3N UAT on 2026-10-02. [PermissionMatrix](../../backend/app/Identity/PermissionMatrix.php) originally expanded grouped labels into 31 explicit capabilities. Phase 3N safe-delete remediation added two owner-only capabilities; the inventory revision adds owner-only `inventory.threshold.configure`, bringing the current matrix to 34 explicit capabilities, and grants the existing `inventory.adjust` to Inventory / Store Staff.

| Role | Code | Explicit permissions |
|---|---|---|
| Business Owner / Super Admin | owner | All 34 current explicit capabilities, including owner-only threshold configuration and the two Phase 3N catalog-delete grants, subject to MFA and object/state policy; the existing recent-auth subset is unchanged |
| Order Processing Staff | order_processing | catalog.read_internal, inventory.read, orders.read, orders.prepare, shipments.record, delivery.record, payments.read_summary, returns.read, returns.review, reports.orders, customers.read_operational |
| Inventory / Store Staff | inventory_store | catalog.read_internal, inventory.read, inventory.adjust, inventory.movements.read, reports.stock |

Customers have no staff role or administrative permissions. No is_admin/is_staff/user_type columns, third-party RBAC package or wildcard owner bypass. Owner is an ordinary explicitly permissioned role, not a database superuser. All staff gates require current active identity and complete MFA, including owner. Marked permissions refunds.approve/refunds.submit, staff.provision, roles.assign and security.configure also require recent authentication at gate level; staff administration repeats checks within its locked transaction.

Availability-only inventory for Order Processing, operational payment/order fields and assigned-order customer visibility remain mandatory field/object policies. Phase 3N UAT authorizes actor display names and inventory-facing reasons for Inventory / Store Staff, while actor IDs/emails and internal references stay hidden; see [inventory](inventory.md). returns.review means read/intake, never approval/decision. Capability definitions do not grant unrestricted data access.

## Storage and authorization conventions
UUID roles, permissions, user_roles and role_permissions with unique codes/assignments and approved FKs. Gates query current database grants. Frontend role visibility is convenience only. Every protected route combines TrustedBrowser, auth:web, CurrentIdentity and a specific can gate; object policies must independently enforce ownership/state. Domain staff operations additionally authorize under a global PostgreSQL transaction lock and lock current actor/target rows, preventing stale grants or last-owner races. Never authorize from request-provided role/permission values.

IdentityPermissionsSeeder reconciles exactly approved grants, preserving existing pivot IDs and recording changed before/after code sets as service audit events. Unknown business permissions are not granted; there is no arbitrary permission-edit endpoint. DatabaseSeeder calls this seed. Repeated unchanged seeds do not append false change events. Rerun the seeder on an existing local/staging environment before exercising the Phase 3N inventory-staff adjustment grant; it adds only the approved role changes and preserves staff MFA.

## Bootstrap and provisioning
After reviewing migration target/environment:

1. Run php artisan migrate and php artisan db:seed --class=IdentityPermissionsSeeder with the correct deployment/test credentials.
2. Authorized deployment operator runs **php artisan identity:bootstrap-owner** interactively. Name/email are prompted; password and confirmation use hidden entry. No password argument, preset password or public bootstrap route exists. Record operator custody through deployment audit/access controls.
3. Bootstrap succeeds only when no owner assignment exists (including disabled owners), inside the staff advisory lock. It appends service audit events. Bootstrap owner must sign in and confirm MFA before staff access.
4. Further staff creation uses POST /api/v1/admin/staff from an MFA-complete owner with recent authentication. Body: name, email, one approved role. Initial password is random and undisclosed; an encrypted queued recovery notification lets the recipient set a password, then enroll MFA. Configure SMTP/identity worker before onboarding real staff.

Phase 3N operational completion adds owner-only `/admin/staff`: paginated/searchable staff, setup invitations, approved role assignment, disable and MFA reset. The existing recent password/TOTP confirmation and server gates remain mandatory. No new provisioning mechanism or permission is introduced. Local invitation capture is optional; see [local setup](local-setup.md#phase-3n-admin-uat-and-optional-mailpit-2026-09-25). Controlled API/service operations:

| Endpoint | Gate / additional safeguards |
|---|---|
| GET /api/v1/admin/staff | staff.provision + recent auth; name/email/role/status/MFA-enrolled boolean only, no secrets; search/pagination |
| POST /api/v1/admin/staff | staff.provision + recent auth; validated role only; audit |
| PATCH /api/v1/admin/staff/{uuid}/roles | roles.assign + recent auth; no self-change, no arbitrary permissions, last-owner guard; revoke sessions/reset tokens |
| POST /api/v1/admin/staff/{uuid}/disable | staff.provision + recent auth; no self-disable, last-owner guard; revoke sessions/reset tokens |
| POST /api/v1/admin/staff/{uuid}/mfa-reset | security.configure + recent auth; no self-reset, verified target staff, allowlisted reason; clear all MFA trust and require re-enrollment |

No actor may upgrade themselves. Public registration cannot assign roles. Role changes increment auth_version and invalidate all target sessions. A newly promoted customer has no confirmed MFA and is restricted to enrollment. No commerce behavior is implemented by these endpoints.

## Recovery and audit
Self-service recovery uses one-use hashed recovery codes. Administrative reset requires another authorized owner, fresh password/TOTP authentication and independently verified staff identity; allowed reason codes are lost_authenticator, suspected_compromise and device_replacement. No secret questions or public MFA removal. Existing sessions, codes, secret, replay counter and reset tokens are invalidated. The user must enroll again.

If the sole owner loses every recovery mechanism, follow the independently verified incident/deployment-operator procedure; do not rerun bootstrap or weaken MFA. Name that operator and establish offline recovery-code custody before production. The application intentionally provides no unauthenticated/self-reset bypass.

Events: owner_bootstrapped, staff_created, role_assigned, role_changed, staff_disabled, permissions_changed, mfa_reset, plus authentication/MFA events. Stored changes contain only role/permission codes or allowlisted reason codes, never credentials.

## Verification
The test matrix independently enumerates every approved grant and originally tested all 93 Phase 3B role/capability cells through backend gates after MFA. The current 34-capability matrix covers 102 cells; the updated StaffMfa integration test includes the new owner-only threshold grant and inventory-staff adjustment grant, plus their denied cells. Additional tests cover unapproved permissions, password-only owner denial, customers, self-escalation, role payload injection, recent auth, last-owner defense, session revocation and administrative reset. See [final report](phase-3b-report.md) for the historical Phase 3B baseline.

## Phase 3N staff landing correction — 2026-09-25

The shared `/login` routes authenticated owner/order-processing/inventory-store identities to `/admin`; incomplete enrollment or MFA challenge still goes to `/mfa`, then to `/admin`. Enrollment recovery codes must be acknowledged before leaving. Registered customers continue to `/account`; that route remains their account/order area. Staff visiting its overview are redirected to administration. The admin Account menu links to `/admin/account` for the existing read-only name/email profile and `/mfa` for security. This changes presentation routing only; backend identity, session, MFA and permission checks remain authoritative.

Phase 3N logout, 401/419 handling and toast/inline-feedback usage are documented in [auth-session-toast.md](auth-session-toast.md).
