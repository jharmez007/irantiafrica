# 19 — Security threat model
Trace: NFR01–03/14/15. Assets: credentials/sessions, customer PII, stock capacity, order integrity, money/refund budget, staff authority, media, audit/recovery data. Boundaries are browser→edge→apps→stores and provider/operational access ([03](03-system-context.md)).

Current reference: [OWASP Top 10:2025](https://top10.owasp.org/2025/0x00_2025-Introduction/) and [ASVS 5.0.0](https://owasp.org/projects/asvs). ASVS Level 2 is the recommended verification basis, not a claim of certification. Map controls to exact ASVS requirements during implementation test planning.

| Asset / threat | Surface | Mitigation | Residual risk / response |
|---|---|---|---|
| Credentials: brute force, stuffing, enumeration | Login/reset/registration | Generic recovery responses, hashing, multi-key throttles, staff MFA, breached-password review | Distributed attacks/account inbox compromise; alerts and recovery procedure |
| Sessions: fixation/theft/replay | Cookies, shared devices, SSR | Rotate login/reset, Secure/HttpOnly/SameSite, CSRF, bounded lifetime, revocation, no public SSR cache | Malware/stolen unlocked browser; recent auth for high-risk actions |
| Customer/order PII: IDOR and broken authorization | IDs, lists, guest access, reports | Ownership policies and scoped high-entropy guest proof on every object; filter before pagination | Permission bug; cross-account negative tests and audit |
| Staff authority: administrative abuse | Refunds, roles, stock/config writes | Granular grants, owner approval, recent auth, immutable approvals and audit, no last-owner removal | Legitimate owner misuse; independent operational review/backup audit export |
| Browser integrity: stored/reflected XSS | Descriptions, names, URLs, media, errors | Escaping, HTML sanitization if rich text allowed, restrictive CSP, no inline untrusted HTML, URL allowlist | Framework/dependency defect; patching and security tests |
| Session authority: CSRF | Cookie-auth mutations | CSRF token/header and origin validation, safe GETs, SameSite defense in depth | XSS bypasses CSRF; separate XSS controls |
| Database: injection | Search/filter/sort/report inputs | Parameterized queries, allowlisted identifiers, least-privilege DB user | Unsafe future raw query; static/review tests |
| Privileges/money: mass assignment | JSON bodies and model writes | Explicit DTO/validated allowlists; server sets owner/role/price/status | New field accidentally exposed; negative payload tests |
| Media/infrastructure: malicious files/SSRF | Uploads, image optimizer, tracking URLs | MIME/magic-byte check, decode/re-encode, pixel/size limits, reject SVG initially, quarantine, fixed hosts | Decoder vulnerability; sandbox/patching; no arbitrary remote fetch |
| Payment integrity: forgery/replay | Webhooks/redirects | Raw HMAC, durable dedupe, server verification and unique receipt/application constraints | Compromised provider secret; rotate and reconcile |
| Money: amount/currency manipulation | Checkout/payment initialization | Authoritative server totals, immutable snapshots, exact amount/currency/reference match | Wrong approved rate/config; review and examples |
| Inventory: race/hoarding | Checkout/expiry/retry/admin | PostgreSQL locks/checks/ledger, reservation bounds and rate limits | Legitimate contention/DoS; alerts and capacity limits |
| Refund money: duplicate/unknown outcome | Worker retry/provider timeout | Durable intent and budget lock, owner approval, reconciliation before retry | Provider lacks idempotency/query; manual verified resolution |
| Availability: rate/resource abuse | Search/upload/report/login/webhook | Body/query limits, timeouts, pagination, rate limits, queue isolation | Volumetric DDoS/provider outage; edge controls and degraded responses |
| Secrets/PII leakage | Logs, error pages, builds, backups | Redaction, debug off, secret manager, no NEXT_PUBLIC secrets, encryption/access scopes | Human misconfiguration; scan/log sampling/rotation |
| Code integrity: supply chain | Dependencies/actions/container registry | Lockfiles, pinned action commits/images, audits/SBOM, provenance review, least CI secrets | New vulnerability; patch/rollback procedure |
| Data integrity: unsafe jobs/deserialization | Queue/event payloads | Typed validated payloads, immutable IDs, no untrusted object deserialization, idempotent effects | Programmer error; replay/failure-injection tests |
| Recovery: backup theft or silent loss | DB/object backup/keys | Encryption, separate credentials, restore drills, immutable retention where affordable | Shared-account compromise; separate recovery access |
| Exceptional conditions | Dependency timeouts, malformed events, full disk | Fail closed on authorization/stock; durable pending money state; bounded retries/alerts | Prolonged outage; owner escalation and reconciliation |

Top 10 coverage: A01 authorization, A02 configuration, A03 supply chain, A04 cryptography, A05 injection, A06 insecure design, A07 authentication, A08 integrity, A09 logging/alerting, A10 exceptional conditions. TLS in transit and provider-managed encryption at rest; no bespoke crypto. Database/cache/object storage private by default; public media bucket policy cannot expose evidence or backups.

Required security gates: authorization matrix tests, cookie/CSRF/CORS review, webhook raw-body tests, guest token leakage tests, upload attacks, refund/stock concurrency, secret/dependency scan and release threat-model review. High/critical unresolved vulnerabilities block release unless a named risk owner approves a time-bounded documented exception under the baseline process. This document is a design assessment, not a penetration-test result.
