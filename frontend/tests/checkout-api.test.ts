// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { checkoutRequest, CheckoutError } from "../src/lib/checkout-api";
afterEach(() => vi.unstubAllGlobals());
it("sends CSRF, credentials and stable idempotency key with no browser totals", async () => {
  document.cookie = "XSRF-TOKEN=token";
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { status: "RESERVED" } }),
    });
  vi.stubGlobal("fetch", fetch);
  await checkoutRequest(
    "/checkout/id/reserve",
    "POST",
    { expected_version: 3, fingerprint: "fingerprint" },
    "retry-key",
  );
  expect(fetch.mock.calls[1][1]).toMatchObject({
    credentials: "include",
    cache: "no-store",
    headers: { "X-XSRF-TOKEN": "token", "Idempotency-Key": "retry-key" },
    body: JSON.stringify({ expected_version: 3, fingerprint: "fingerprint" }),
  });
});
it("preserves structured reconciliation and validation messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: "CHECKOUT_REVIEW_REQUIRED",
          message: "Review changed prices.",
          details: { checkout_id: "owned" },
        },
      }),
    }),
  );
  await expect(checkoutRequest("/checkout/current")).rejects.toMatchObject({
    code: "CHECKOUT_REVIEW_REQUIRED",
    details: { checkout_id: "owned" },
  } satisfies Partial<CheckoutError>);
});
