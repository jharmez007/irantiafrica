// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cartRequest } from "../src/lib/cart-api";
afterEach(() => vi.unstubAllGlobals());
describe("cart API transport", () => {
  it("bootstraps CSRF and uses a private same-origin request without price fields", async () => {
    document.cookie = "XSRF-TOKEN=test-csrf; path=/";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { version: 2 } }),
      });
    vi.stubGlobal("fetch", fetch);
    expect(
      await cartRequest("POST", "/items", {
        variant_id: "variant",
        quantity: 1,
        expected_version: 1,
      }),
    ).toEqual({ version: 2 });
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe("/api/v1/cart/items");
    expect(options.credentials).toBe("include");
    expect(options.cache).toBe("no-store");
    expect(options.headers["X-XSRF-TOKEN"]).toBe("test-csrf");
    expect(options.body).not.toContain("price");
  });
  it("reports field validation messages without silently accepting a mutation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({
            error: {
              code: "VALIDATION_ERROR",
              fields: { quantity: ["Quantity must be positive."] },
            },
          }),
        }),
    );
    await expect(
      cartRequest("PATCH", "/items/line", { quantity: 0, expected_version: 1 }),
    ).rejects.toThrow("Quantity must be positive.");
  });
});
