# Security review checklist

Phase 3M. This is a scoped engineering review, not penetration-test or regulatory certification. Approved RBAC, guest capability, money and inventory semantics are unchanged.

| Surface | Controls / evidence to retain |
|---|---|
| Auth | Multi-key login/recovery/MFA throttles; generic recovery responses; session regeneration/revocation; encrypted PostgreSQL sessions; absolute/idle limits; staff TOTP + one-use recovery codes; recent-auth and last-owner guard. AuthenticationTest/StaffMfaTest |
| Origins/CSRF | Exact allowlisted Origin or Referer, Sanctum stateful sessions, CSRF on browser mutations; raw signed Paystack ingress is narrow exception. Reject foreign origin and missing token; no wildcard authenticated CORS |
| Authorization | All admin routes use authentication/current identity plus permission middleware or controller policies. Catalog read routes authorize model policies internally. Reports use permission-specific projections. No frontend-only grants. Customer ownership and guest order capability are independent of email/order number |
| Input/assignment | Domain controllers validate allowlisted input/DTOs; catalog request rejects unexpected fields; version/idempotency keys required. Model fillable state is internal-service authority, not request authority. No generic model CRUD endpoint. Existing tests cover role/state/price/refund/quantity injection and malformed UUIDs |
| SQL | Search query text parameter-bound; catalog sort is match/allowlist; reporting date/window validated; raw aggregate SQL is static with bound date/timezone. No raw caller SQL. PostgreSQL constraints and transaction locks remain final safeguards |
| Uploads | Private quarantine UUID keys, exact size/checksum, actual MIME + decode + pixel bounds, no SVG/HTML, private WebP320/640/1280 derivatives, bounded worker memory. Signed local/S3 completion, ownership and publication checks; maintenance recovers interrupted processing |
| Payments/refunds | Server amounts/NGN, signed raw webhook, durable deduplication/verification, reference/provider-ID uniqueness, once-only stock consumption; uncertain receipts held. Refund owner/recent MFA and historical capped allocation; UNKNOWN never re-POST. External UAT separate |
| Tracking/XSS | Exact HTTPS tracking-host allowlist; escaped text; no user HTML or arbitrary remote media proxy |
| Errors | API generic unexpected-error envelope, generated request ID, no SQL/stack/provider body. Production debug reset before guard failures. HealthTest exercises production environment error response |
| Secrets | Current nonignored files and reachable git blobs scanned with targeted provider/token/private-key/assignment patterns; no nonempty secret assignment found. Local env ignored. Pattern scan is not exhaustive; rotate any later-discovered committed secret before use |
| Headers | nosniff, DENY/frame-ancestors, strict-origin referrer, limited Permissions-Policy. Production CSP excludes eval/objects and limits assets/uploads to exact origins. HSTS only production build with HTTPS SITE_URL; no includeSubDomains/preload commitment |

## Explicit CSP exception

Static Next pages embed hydration scripts and inline styles. `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` are retained for this architecture; **this policy does not prevent all inline-script XSS**. Escaped rendering/no arbitrary HTML and input controls remain essential. A nonce design would force dynamic rendering of currently static routes; not introduced silently. No production unsafe-eval, third-party analytics or embedded Paystack frame. Paystack is a top-level redirect; CSP does not need broad Paystack script access. Provider/CDN allowlist must be browser-tested at staging. Keep this exception visible at security sign-off.

## Dependency exception

ESLint 9.39.5 EOL exception remains explicit (ADR010). On 2026-09-24 npm publisher metadata showed ESLint 10.11.0 available, but react/jsx-a11 y/import peer ranges still stop at9. Do not force incompatible peers. Reassess before production; upgrade only with full frontend regression. Composer/npm audits and out-of-date summaries are in the phase report. Minor updates are maintenance candidates, not automatic authorization for blind upgrades.

## Operator boundaries

Use private networking and least privilege; do not expose readiness/config/queue dashboards publicly. Failed-job payloads are operationally sensitive (identity notifications are encrypted); access restricted. Queue retry is not a safe generic payment/refund recovery action. Log collectors and edge access logs must omit query strings, cookies, authorization and bodies. Apply patching/secret rotation with named owners. High/critical unresolved findings require named time-bound acceptance before release; none may be hidden by a passing automated audit.

## Browser-discovered hardening defects

Real browser review identified (and Phase 3M fixes) two integration/security defects: identity responses omitted the permission list required by the dashboard; and credential-bearing forms defaulted to native GET before JavaScript hydration. Identity now exposes actual assigned grants only after staff MFA, with backend authorization unchanged. Auth/MFA/refund reauthentication and address/fulfilment/return forms explicitly use POST so native fallback cannot put entered sensitive fields in the query string. Normal interactive submissions remain CSRF-protected API requests; native fallback is not an alternate authentication endpoint. Synthetic credentials only were used during discovery; no real-user exposure was observed.
