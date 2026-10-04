// @vitest-environment jsdom
import { createRequire } from "node:module";
import { StrictMode } from "react";
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
      snapshot: {
        name: "Woven basket",
        sku: "BASKET",
        options: ["Natural"],
        image: null,
      },
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
    if (path === "/checkout" && method === "POST") return draft;
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
  it("automatically starts a guest checkout with a retry key and server cart version", async () => {
    setup(null);
    render(<CheckoutPage />);
    expect(
      screen.getByRole("status", { name: "Loading checkout" }),
    ).toBeTruthy();
    await screen.findByRole("heading", { name: "Contact and delivery" });
    expect(screen.queryByText("Begin checkout")).toBeNull();
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(1);
  });
  it("resumes an existing guest or account checkout without creating another", async () => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByRole("button", {
      name: "Confirm total and reserve items",
    });
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(0);
  });
  it("does not create duplicate sessions during Strict Mode initialization", async () => {
    setup(null);
    render(
      <StrictMode>
        <CheckoutPage />
      </StrictMode>,
    );
    await screen.findByLabelText("Contact email");
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(1);
  });
  it("starts an account-owned checkout with the same safe cart version flow", async () => {
    mock.auth.user = { id: "customer" };
    setup(null);
    mock.request.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/checkout/current") return null;
      if (path === "/checkout/destinations") return places;
      if (path === "/addresses" && method === "GET") return [];
      if (path === "/checkout" && method === "POST")
        return { ...draft, ownership: "account" };
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByLabelText("Contact email");
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
  });
  it("keeps cart contents and reuses the initiation key when retrying a failed start", async () => {
    setup(null);
    let attempts = 0;
    mock.request.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/checkout/current") return null;
      if (path === "/checkout/destinations") return places;
      if (path === "/checkout" && method === "POST") {
        attempts++;
        if (attempts === 1) throw new Error("Network unavailable");
        return draft;
      }
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByRole("alert");
    expect(screen.getByText("Network unavailable")).toBeTruthy();
    expect(mock.cart.items).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Retry checkout" }),
    );
    await screen.findByLabelText("Contact email");
    const calls = mock.request.mock.calls.filter(
      (call) => call[0] === "/checkout",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][3]).toBe(calls[1][3]);
  });
  it("shows snapshot line details in the order summary", async () => {
    setup({
      ...draft,
      lines: [
        {
          ...draft.lines[0],
          snapshot: {
            ...draft.lines[0].snapshot,
            image: {
              id: "image-one",
              variant_id: null,
              alt_text: "Woven basket in warm light",
              position: 0,
              width: 640,
              height: 640,
              sources: [{ url: "/basket.webp", width: 640, height: 640 }],
            },
          },
        },
      ],
    });
    render(<CheckoutPage />);
    await screen.findByRole("heading", { name: "Order summary" });
    expect(screen.getByAltText("Woven basket in warm light")).toBeTruthy();
    expect(screen.getByText("Woven basket")).toBeTruthy();
    expect(screen.getByText("Natural")).toBeTruthy();
    expect(screen.getByText("Quantity 3")).toBeTruthy();
    expect(screen.getAllByText("₦10.05")).toHaveLength(3);
  });
  it("keeps a 22-line order compact, expands into a scroll region, and keeps totals outside", async () => {
    setup({
      ...quote,
      lines: Array.from({ length: 22 }, (_, index) => ({
        ...draft.lines[0],
        id: `line-${index}`,
        quantity: 1,
        snapshot: { ...draft.lines[0].snapshot, name: `Item ${index + 1}` },
      })),
    });
    render(<CheckoutPage />);
    const summary = await screen.findByRole("complementary", {
      name: "Order summary",
    });
    expect(screen.getByText("22 items")).toBeTruthy();
    expect(summary.querySelectorAll(".checkout-lines li")).toHaveLength(4);
    expect(
      summary
        .querySelector(".checkout-lines")
        ?.contains(screen.getByText("Items subtotal")),
    ).toBe(false);
    const show = screen.getByRole("button", { name: "Show 18 more items" });
    await userEvent.click(show);
    expect(summary.querySelectorAll(".checkout-lines li")).toHaveLength(22);
    expect(summary.querySelector(".checkout-lines--expanded")).toBeTruthy();
    expect(screen.getByText("Item 22")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Show fewer items" }),
    );
    expect(summary.querySelectorAll(".checkout-lines li")).toHaveLength(4);
  });
  it("offers an accessible compact mobile disclosure with the current total", async () => {
    setup(quote);
    render(<CheckoutPage />);
    const toggle = await screen.findByRole("button", {
      name: /Order summary · 3 items/,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("₦16.62");
    expect(toggle.getAttribute("aria-controls")).toBe(
      "checkout-summary-content",
    );
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      document
        .getElementById("checkout-summary-content")
        ?.getAttribute("data-mobile-open"),
    ).toBe("true");
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
    await screen.findAllByText("₦16.62");
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
    await screen.findAllByText("₦16.62");
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
      await screen.findByRole("button", { name: "Try checkout again" });
      expect(
        screen.queryByRole("button", {
          name: "Confirm total and reserve items",
        }),
      ).toBeNull();
      expect(screen.getByRole("link", { name: "Review my cart" })).toBeTruthy();
      expect(
        screen.queryByRole("complementary", { name: "Order summary" }),
      ).toBeNull();
      expect(mock.cart.items).toHaveLength(1);
    },
  );
  it("starts a fresh checkout only when the customer chooses retry in recovery", async () => {
    setup({ ...quote, status: "REVIEW_REQUIRED" });
    render(<CheckoutPage />);
    await screen.findByRole("heading", {
      name: "Your cart needs a quick review",
    });
    expect(
      screen.getByRole("link", { name: "Review my cart" }).getAttribute("href"),
    ).toBe("/cart");
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/checkout" && call[1] === "POST",
      ),
    ).toHaveLength(0);
    mock.request.mockResolvedValueOnce(draft);
    await userEvent.click(
      screen.getByRole("button", { name: "Try checkout again" }),
    );
    await screen.findByRole("heading", { name: "Contact and delivery" });
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
  });
  it("cancels a reservation without deleting its history", async () => {
    setup({ ...quote, status: "RESERVED" });
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Cancel checkout" });
    mock.request.mockResolvedValueOnce({ ...quote, status: "CANCELLED" });
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel checkout" }),
    );
    await screen.findByRole("heading", { name: "Checkout stopped" });
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
    await screen.findAllByText("₦16.62");
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
