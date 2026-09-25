// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminInventory } from "../src/components/inventory/admin-inventory";
import { ApiError } from "../src/lib/auth-api";
import type { InventoryEntry } from "../src/lib/inventory";

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as null | { authentication_state: string; roles: string[] },
    loading: false,
  },
  api: vi.fn(),
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/catalog-admin-api", () => ({ catalogAdmin: mocks.api }));
const entry: InventoryEntry = {
  variant_id: "variant",
  sku: "WOVEN-1",
  product_id: "product",
  product_name: "Woven textile",
  product_status: "published",
  variant_status: "active",
  available: true,
  initialized: true,
  on_hand: 100,
  reserved: 2,
  available_quantity: 98,
  low_stock_threshold: 5,
  low_stock: false,
  version: "4",
};
const meta = { current_page: 1, last_page: 1, per_page: 24, total: 1 };
function respond(path: string, current = entry) {
  if (path.includes("/movements?"))
    return { data: [], meta: { ...meta, total: 0 } };
  if (path.startsWith("/inventory?")) return { data: [current], meta };
  return { data: current };
}
beforeEach(() => {
  mocks.auth = {
    user: { authentication_state: "authenticated", roles: ["owner"] },
    loading: false,
  };
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (path: string) => respond(path));
});
afterEach(cleanup);
async function selectEntry() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Woven textile — WOVEN-1" }),
  );
  await screen.findByRole("heading", { name: "Woven textile — WOVEN-1" });
  return user;
}
async function reviewAdjustment() {
  const user = await selectEntry();
  await user.type(screen.getByLabelText("Quantity change"), "-3");
  await user.type(screen.getByLabelText("Reason"), "Damaged units removed");
  await user.click(screen.getByRole("button", { name: "Review stock change" }));
  return user;
}
describe("inventory administration", () => {
  it("requires staff MFA and refuses customer access before fetching", () => {
    mocks.auth.user = {
      authentication_state: "mfa_required",
      roles: ["owner"],
    };
    const view = render(<AdminInventory />);
    expect(
      screen.getByRole("link", { name: "Complete staff verification" }),
    ).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalled();
    mocks.auth.user = { authentication_state: "authenticated", roles: [] };
    view.rerender(<AdminInventory />);
    expect(screen.getByRole("alert").textContent).toContain(
      "do not have inventory access",
    );
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("renders loading and recoverable request failure states", async () => {
    mocks.api.mockRejectedValueOnce(
      new Error("Inventory is temporarily unavailable."),
    );
    render(<AdminInventory />);
    expect(screen.getByText("Loading inventory…")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "temporarily unavailable",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh inventory" }),
    );
    expect(
      await screen.findByRole("button", { name: "Woven textile — WOVEN-1" }),
    ).toBeTruthy();
  });
  it("shows order-processing staff availability without quantities or movement history", async () => {
    mocks.auth.user!.roles = ["order_processing"];
    mocks.api.mockImplementation(async (path: string) =>
      respond(path, { ...entry, available: false }),
    );
    render(<AdminInventory />);
    await selectEntry();
    expect(screen.getAllByText("Out of stock").length).toBe(2);
    expect(screen.queryByText("On hand")).toBeNull();
    expect(screen.queryByText("Reserved")).toBeNull();
    expect(screen.queryByText("Stock movement history")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Review stock change" }),
    ).toBeNull();
    expect(
      mocks.api.mock.calls.some(([path]) =>
        String(path).includes("/movements"),
      ),
    ).toBe(false);
  });
  it("keeps inventory staff read-only and redacts owner-only history information", async () => {
    mocks.auth.user!.roles = ["inventory_store"];
    mocks.api.mockImplementation(async (path: string) =>
      path.includes("/movements?")
        ? {
            data: [
              {
                id: "movement",
                kind: "adjustment",
                on_hand_delta: 5,
                reserved_delta: 0,
                on_hand_after: 100,
                reserved_after: 2,
                reason: "Sensitive owner reason",
                actor: { id: "owner", name: "Owner Person" },
                created_at: "2026-09-22T10:00:00Z",
              },
            ],
            meta,
          }
        : respond(path),
    );
    render(<AdminInventory />);
    await selectEntry();
    expect(screen.getByText("Operational stock movement")).toBeTruthy();
    expect(screen.queryByText("Sensitive owner reason")).toBeNull();
    expect(screen.queryByText(/Owner Person/)).toBeNull();
    expect(screen.queryByLabelText("Quantity change")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Stock movement history" }),
    ).toBeTruthy();
  });
  it("requires owner review and reuses the idempotency key for an unchanged retry", async () => {
    let attempts = 0;
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (method === "POST" && attempts++ === 0)
        throw new Error("Connection lost. Retry the reviewed change.");
      return respond(path);
    });
    render(<AdminInventory />);
    const user = await reviewAdjustment();
    expect(screen.getByText("Quantity change: -3")).toBeTruthy();
    expect(screen.getByText("New on-hand quantity: 97")).toBeTruthy();
    expect(mocks.api.mock.calls.some(([, method]) => method === "POST")).toBe(
      false,
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Cancel review" }));
    await user.click(
      screen.getByRole("button", { name: "Review stock change" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    await screen.findByText(
      "Stock change saved. Inventory is being refreshed.",
    );
    const writes = mocks.api.mock.calls.filter(
      ([, method]) => method === "POST",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0]).toEqual([
      "/inventory/variant/adjustments",
      "POST",
      { delta: -3, reason: "Damaged units removed", expected_version: "4" },
      { "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ]);
  });
  it("uses a new idempotency key after editing a reviewed payload", async () => {
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (method === "POST") throw new Error("Connection lost.");
      return respond(path);
    });
    render(<AdminInventory />);
    const user = await reviewAdjustment();
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    await screen.findByRole("alert");
    await user.clear(screen.getByLabelText("Quantity change"));
    await user.type(screen.getByLabelText("Quantity change"), "-4");
    expect(
      screen.queryByRole("button", { name: "Confirm stock change" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Review stock change" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.filter(([, method]) => method === "POST"),
      ).toHaveLength(2),
    );
    const writes = mocks.api.mock.calls.filter(
      ([, method]) => method === "POST",
    );
    expect(writes[0][3]["Idempotency-Key"]).not.toBe(
      writes[1][3]["Idempotency-Key"],
    );
  });
  it("refreshes conflicts and requires another review against the new version", async () => {
    let changed = false;
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (method === "POST" && !changed) {
        changed = true;
        throw new ApiError(409, "Conflict");
      }
      return respond(
        path,
        changed ? { ...entry, on_hand: 80, version: "5" } : entry,
      );
    });
    render(<AdminInventory />);
    const user = await reviewAdjustment();
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Review the refreshed quantities",
    );
    await screen.findByLabelText("Quantity change");
    expect(
      screen.queryByRole("button", { name: "Confirm stock change" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Review stock change" }),
    );
    expect(screen.getByText("New on-hand quantity: 77")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/inventory/variant/adjustments",
        "POST",
        expect.objectContaining({ expected_version: "5" }),
        expect.anything(),
      ),
    );
  });
  it("records a positive opening balance only after confirmation", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      respond(path, {
        ...entry,
        initialized: false,
        on_hand: 0,
        reserved: 0,
        available_quantity: 0,
        available: false,
        version: null,
      }),
    );
    render(<AdminInventory />);
    const user = await selectEntry();
    await user.type(screen.getByLabelText("Opening quantity"), "12");
    await user.type(screen.getByLabelText("Reason"), "Initial counted stock");
    await user.click(
      screen.getByRole("button", { name: "Review stock change" }),
    );
    expect(screen.getByText("New on-hand quantity: 12")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirm stock change" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/inventory/variant/opening",
        "POST",
        { quantity: 12, reason: "Initial counted stock" },
        expect.anything(),
      ),
    );
  });
  it("rejects zero changes and removal below reserved stock before sending", async () => {
    render(<AdminInventory />);
    const user = await selectEntry();
    await user.type(screen.getByLabelText("Quantity change"), "0");
    await user.type(screen.getByLabelText("Reason"), "Count correction");
    await user.click(
      screen.getByRole("button", { name: "Review stock change" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "whole-number stock change",
    );
    await user.clear(screen.getByLabelText("Quantity change"));
    await user.type(screen.getByLabelText("Quantity change"), "-99");
    await user.click(
      screen.getByRole("button", { name: "Review stock change" }),
    );
    expect(
      screen.queryByRole("button", { name: "Confirm stock change" }),
    ).toBeNull();
    expect(mocks.api.mock.calls.some(([, method]) => method === "POST")).toBe(
      false,
    );
  });
  it("searches and pages inventory without losing the search term", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/inventory?")
        ? { data: [entry], meta: { ...meta, last_page: 2 } }
        : respond(path),
    );
    render(<AdminInventory />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "woven");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/inventory?q=woven&page=1&per_page=24",
      ),
    );
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Inventory pagination" }),
      ).getByRole("button", { name: "Next" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/inventory?q=woven&page=2&per_page=24",
      ),
    );
  });
});
