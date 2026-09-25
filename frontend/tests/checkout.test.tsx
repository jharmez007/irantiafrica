// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutPage } from "../src/components/checkout/checkout-page";
import { CheckoutError, type Checkout } from "../src/lib/checkout-api";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  auth: { user: null as null | { id: string }, loading: false },
  cart: { version: 2, items: [{}], needs_review: false },
  refresh: vi.fn(),
}));
vi.mock("@/lib/checkout-api", async (original) => ({
  ...(await original<typeof import("../src/lib/checkout-api")>()),
  checkoutRequest: mock.request,
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mock.auth }));
vi.mock("@/components/cart/cart-provider", () => ({
  useCart: () => ({ cart: mock.cart, refresh: mock.refresh }),
}));
const address = {
  recipient_name: "Test recipient",
  phone: "+2348012345678",
  line1: "1 Test Road",
  line2: "",
  city: "Lagos",
  state_code: "LAGOS",
  locality_code: null,
  postal_code: "",
  country_code: "NG" as const,
};
const draft: Checkout = {
  id: "checkout-one",
  ownership: "guest",
  status: "DRAFT",
  version: 1,
  currency: "NGN",
  expires_at: "2026-09-23T20:00:00Z",
  fingerprint: null,
  subtotal_minor: "1005",
  tax_minor: null,
  delivery_minor: null,
  total_minor: null,
  contact: null,
  calculation: null,
  lines: [
    {
      id: "line",
      quantity: 3,
      unit_price_minor: "335",
      line_subtotal_minor: "1005",
      snapshot: { name: "Woven basket", sku: "BASKET", options: ["Natural"] },
      tax: null,
    },
  ],
};
const quote: Checkout = {
  ...draft,
  status: "QUOTED",
  version: 3,
  fingerprint: "abc",
  contact: { email: "test@example.test", address },
  tax_minor: "152",
  delivery_minor: "505",
  total_minor: "1662",
  calculation: {
    development_only: true,
    product_tax_minor: "101",
    delivery_tax_minor: "51",
    delivery_taxable: true,
    delivery: { service_label: "Sample delivery" },
  },
};
const places = { states: { LAGOS: "Lagos", FCT: "FCT" }, areas: [] };
function setup(current: Checkout | null = draft) {
  mock.request.mockImplementation(async (path: string, method = "GET") => {
    if (path === "/checkout/current") return current;
    if (path === "/checkout/destinations") return places;
    if (path === "/addresses" && method === "GET")
      return [{ id: "address-one", ...address }];
    throw new Error("Unexpected request " + path);
  });
}
beforeEach(() => {
  mock.request.mockReset();
  mock.auth = { user: null, loading: false };
  mock.cart = { version: 2, items: [{}], needs_review: false };
  document.documentElement.lang = "en";
  document.title = "Checkout test";
  setup();
});
afterEach(cleanup);
describe("checkout flow", () => {
  it("loads and starts a guest checkout with a retry key and server cart version", async () => {
    setup(null);
    render(<CheckoutPage />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    await screen.findByRole("button", { name: "Continue with your cart" });
    mock.request.mockResolvedValueOnce(draft);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with your cart" }),
    );
    await screen.findByRole("heading", { name: "Contact and delivery" });
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
  });
  it("submits contact/address without browser totals and updates the review step", async () => {
    render(<CheckoutPage />);
    await screen.findByLabelText("Contact email");
    await userEvent.type(
      screen.getByLabelText("Contact email"),
      "test@example.test",
    );
    for (const [label, value] of [
      ["Recipient name", "Test recipient"],
      ["Phone number", "08012345678"],
      ["Street address", "1 Test Road"],
      ["City or town", "Lagos"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await userEvent.selectOptions(
      screen.getByLabelText("State / FCT"),
      "LAGOS",
    );
    mock.request.mockResolvedValueOnce({
      ...draft,
      version: 2,
      contact: { email: "test@example.test", address },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save delivery details" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Calculate and review total" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    const call = mock.request.mock.calls.find(
      (c) => c[0] === "/checkout/checkout-one/address",
    );
    expect(call?.[1]).toBe("PATCH");
    expect(call?.[2]).not.toHaveProperty("total_minor");
  });
  it("selects an account-owned saved address", async () => {
    mock.auth.user = { id: "customer" };
    render(<CheckoutPage />);
    await screen.findByLabelText("Saved address");
    await userEvent.selectOptions(
      screen.getByLabelText("Saved address"),
      "address-one",
    );
    fireEvent.change(screen.getByLabelText("Contact email"), {
      target: { value: "test@example.test" },
    });
    mock.request.mockResolvedValueOnce({
      ...draft,
      ownership: "account",
      contact: { email: "test@example.test", address },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save delivery details" }),
    );
    await waitFor(() =>
      expect(mock.request).toHaveBeenCalledWith(
        "/checkout/checkout-one/address",
        "PATCH",
        {
          expected_version: 1,
          email: "test@example.test",
          saved_address_id: "address-one",
        },
        expect.any(String),
      ),
    );
  });
  it("renders only server totals and explicitly confirms a reservation", async () => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByText("₦16.62");
    expect(screen.getByText("DEVELOPMENT CONFIGURATION ONLY")).toBeTruthy();
    mock.request.mockResolvedValueOnce({
      ...quote,
      status: "RESERVED",
      version: 4,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm total and reserve items" }),
    );
    await screen.findByText(/Your items are reserved until/);
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout/checkout-one/reserve",
      "POST",
      { expected_version: 3, fingerprint: "abc" },
      expect.any(String),
    );
    expect(screen.queryByRole("button", { name: /pay now/i })).toBeNull();
  });
  it.each([
    "DELIVERY_UNAVAILABLE",
    "TAX_CONFIGURATION_REQUIRED",
    "INSUFFICIENT_STOCK",
  ])("announces %s and focuses the error", async (code) => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByText("₦16.62");
    mock.request.mockRejectedValueOnce(
      new CheckoutError(409, code, "Please review configuration or stock."),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm total and reserve items" }),
    );
    await screen.findByRole("alert");
    expect(document.activeElement?.id).toBe("checkout-errors");
    expect(screen.getByRole("alert").textContent).toContain("Please review");
  });
  it.each(["EXPIRED", "REVIEW_REQUIRED", "CANCELLED"] as const)(
    "shows %s without an active reservation action",
    async (status) => {
      setup({ ...quote, status });
      render(<CheckoutPage />);
      await screen.findByRole("button", { name: "Start a new checkout" });
      expect(
        screen.queryByRole("button", {
          name: "Confirm total and reserve items",
        }),
      ).toBeNull();
      expect(screen.getByText(/Your cart has been kept/)).toBeTruthy();
    },
  );
  it("cancels a reservation without deleting its history", async () => {
    setup({ ...quote, status: "RESERVED" });
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Cancel checkout" });
    mock.request.mockResolvedValueOnce({ ...quote, status: "CANCELLED" });
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel checkout" }),
    );
    await screen.findByRole("heading", { name: "Checkout cancelled" });
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout/checkout-one",
      "DELETE",
      {},
      expect.any(String),
    );
  });
  it("preserves the retry key after a network failure", async () => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByText("₦16.62");
    mock.request.mockRejectedValueOnce(new Error("network"));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm total and reserve items" }),
    );
    await screen.findByRole("alert");
    mock.request.mockResolvedValueOnce({ ...quote, status: "RESERVED" });
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm total and reserve items" }),
    );
    await screen.findByText(/Your items are reserved until/);
    const calls = mock.request.mock.calls.filter((c) =>
      c[0].endsWith("/reserve"),
    );
    expect(calls[0][3]).toBe(calls[1][3]);
  });
  it("has labeled controls and no axe violations in the address step", async () => {
    render(<CheckoutPage />);
    await screen.findByLabelText("Contact email");
    const require = createRequire(import.meta.url);
    const axe = require("axe-core");
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
    expect(
      screen.getByLabelText("State / FCT").getAttribute("aria-describedby"),
    ).toBe("checkout-errors");
  });
  it("requires changed delivery details to be saved before confirming the old quote", async () => {
    setup(quote);
    render(<CheckoutPage />);
    const button = await screen.findByRole("button", {
      name: "Confirm total and reserve items",
    });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "2 Different Road" },
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(
        "Save your delivery changes and calculate a new total before confirming.",
      ),
    ).toBeTruthy();
  });
  it("offers an explicit new attempt after promotion without allowing checkout cancellation", async () => {
    setup({ ...quote, status: "RESERVED", order_id: "order-created" });
    render(<CheckoutPage />);
    await screen.findByRole("link", { name: "View your order" });
    expect(
      screen.getByRole("button", { name: "Start a new checkout" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Cancel checkout" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create order — payment pending" }),
    ).toBeNull();
  });
});
