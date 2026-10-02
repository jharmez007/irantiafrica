# Phase 3N authentication feedback and session UX

The browser uses the existing same-origin Next.js rewrite for `/sanctum/csrf-cookie` and `/api/v1/*`. Writes obtain the readable XSRF cookie, send `X-XSRF-TOKEN` and credentialed cookies, and retain Laravel's origin, session, CSRF and MFA gates. `POST /api/v1/auth/logout` is guarded by `auth:web` and `CurrentIdentity`; on success Laravel logs out the web guard, invalidates the server session, regenerates the CSRF token and returns 204 with no body. The frontend clears its identity only after that response. Staff and customers go to `/login` and receive “Signed out successfully”. A duplicate click shares the in-flight logout promise.

The reported “Unable to sign out” was reproduced from an already-expired staff page. With a fresh staff session, the same UI action returns 204. Once a staff session has expired, `auth:web`/`CurrentIdentity` rejects the logout request with 401 before the controller; the former frontend catch treated that as a generic logout failure and left stale UI visible. A logout 401 now probes `/auth/me`, treats confirmed unauthenticated state as signed out, and redirects. A 419 refreshes the CSRF cookie and probes identity; if still authenticated, it shows an error and requires an explicit retry. Network/5xx failures never clear local identity or claim success.

Authenticated API clients report 401/419 centrally. A 401 triggers one `/auth/me` probe: only a confirmed 401 clears identity, announces session expiry once and redirects to `/login`. This avoids treating an order-scoped capability failure as an expired login. A protected route reloaded with an invalid session also redirects from the initial identity check. A 419 displays “Your security check expired. Please retry this action.” and refreshes the CSRF cookie; the failed mutation is never replayed automatically. Form actions retain their own error and input state until navigation. The product editor's unsaved-change navigation warning remains in place; an expiry toast explicitly says the attempted action was not saved. Browsers may still leave a draft through client-side navigation, so users should copy unsaved changes before signing in again.

`ToastProvider` is mounted once at the app root. Use `toast.success/error/warning/info(title, optionalDescription)` from `@/lib/toast` for transient action feedback. Toasts stack to four, suppress active duplicates, auto-dismiss (five seconds, errors eight), and have keyboard-operable close buttons. Errors use `role=alert`; other tones use `role=status`. Color, icons and text convey tone together. The mobile inset sits below the header/logo; toasts do not take focus. Keep field validation by its field, record/action errors inline until corrected, sustained payment/stock/checkout review states on the page, and destructive confirmation in dialogs.

Inventory of frontend notification mechanisms reviewed on 2026-10-02:

| Prior occurrence | Treatment |
|---|---|
| `alert(` / `window.alert(` across `frontend/src` | **0** user-facing calls; no replacement needed. `window.confirm` remains for destructive choices. |
| Authentication reset/forgot success, MFA confirmation, all three logout surfaces | Converted to shared toasts; credential/OTP validation remains inline. |
| Product editor save/upload/restore and polling completion; product-list restore; category save | Converted transient success to toasts. Product editor save failures remain inline beside retained input. |
| Inventory adjustment; staff provision/disable/role/MFA operations | Converted transient success to toasts. Quantity conflicts and recent-auth errors remain contextual. |
| Order cancellation/fulfilment, payment reconciliation, customer/admin return actions | Converted transient success to toasts. Payment provider state and return/action errors remain in their record panels. |
| Add-to-cart and ordinary cart/checkout updates | Converted transient success to toasts. Price reconciliation, reservations and checkout errors remain on the page. |
| Loading, empty, publication readiness, financial hold and development-configuration statuses | Persistent application state; left inline. |

No password, token, cookie value, recovery code or raw API response object is placed in a toast. The recovery endpoint's approved public confirmation message may appear as a description. Copy is safe and human-readable. The backend API contract and security policy are unchanged.
