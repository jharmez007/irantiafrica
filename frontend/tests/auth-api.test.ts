import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, authRequest, csrfCookie } from "../src/lib/auth-api";
import { catalogAdmin } from "../src/lib/catalog-admin-api";

afterEach(() => vi.unstubAllGlobals());
describe("browser authentication transport", () => {
  it("sends inventory idempotency keys with the same authenticated CSRF transport", async () => {
    vi.stubGlobal("document", { cookie: "XSRF-TOKEN=proof%3D" });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetch);
    await catalogAdmin(
      "/inventory/variant/opening",
      "POST",
      { quantity: 10, reason: "Opening count" },
      { "Idempotency-Key": "b8914f5b-8fa4-49b1-b9d9-f776035d0364" },
    );
    expect(fetch.mock.calls[1][0]).toBe(
      "/api/v1/admin/inventory/variant/opening",
    );
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "X-XSRF-TOKEN": "proof=",
        "Idempotency-Key": "b8914f5b-8fa4-49b1-b9d9-f776035d0364",
      },
    });
  });
  it("decodes the readable CSRF cookie without using the session cookie", () => {
    expect(csrfCookie("iranti-session=secret; XSRF-TOKEN=proof%3D")).toBe(
      "proof=",
    );
    expect(csrfCookie("iranti-session=secret")).toBe("");
  });
  it("bootstraps CSRF and sends credentialed writes with the CSRF header", async () => {
    vi.stubGlobal("document", {
      cookie: "XSRF-TOKEN=proof%3D; session=secret",
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: { id: "uuid" } }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await authRequest("/auth/login", {
        email: "person@example.test",
        password: "secret",
      }),
    ).toEqual({ id: "uuid" });
    expect(fetch.mock.calls[0][0]).toBe("/sanctum/csrf-cookie");
    expect(fetch.mock.calls[1][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
      headers: { "X-XSRF-TOKEN": "proof=" },
    });
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
  });
  it("fails closed if CSRF bootstrap fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(authRequest("/auth/logout", {})).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves forbidden status and safe errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
        ),
    );
    await expect(authRequest("/admin/access")).rejects.toMatchObject({
      status: 403,
    });
  });
});
