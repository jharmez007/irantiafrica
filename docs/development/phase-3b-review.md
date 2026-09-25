> **Gate resolution — 2026-09-21:** The client has approved document 17 exact grants and mandatory staff TOTP, recovery codes and controlled administrative reset. Both previously pending gates below are resolved. See ADR-012 and the final Phase 3B report.

# Phase 3B pre-implementation review
Date: 2026-09-21. Phase 3A formally approved by client; Phase 3B authorized, Phase 3C excluded.

Reviewed Phase 1 functional/non-functional requirements and open decisions; architecture 08/16/17/18/19/20/31/32; Phase 3A report/ADR-011; current model, migrations, dependency locks, session/CSRF middleware and Git status. One shared UUID User, no CustomerProfile, PostgreSQL sessions and cookie-only authentication remain correct. Roles/permissions do not yet exist. Only frontend manifest/lockfile are committed; existing remaining files are untracked and preserved.

Client decisions pending: approval of document 17's exact grants and MFA/recovery policy (asked separately). Do not silently implement proposed grants. Customer authentication and generic RBAC storage can proceed independently. Verification is recommended but unapproved: no mandatory verification gate or verification endpoints in this phase unless subsequently approved. Registration uses only name/email/password/confirmation. Guest order capabilities/cart merge depend on future commerce resources and are outside the client's current narrowed Phase 3B scope.

Engineering defaults will be documented: password length, rate limits, session lifetimes and cleanup. No role bypass, third-party RBAC package or commerce implementation. Exact API paths follow document 18 rather than the illustrative alternatives in the phase instruction.
