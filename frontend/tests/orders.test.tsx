vi.mock("@/components/returns/returns-panel", () => ({
  ReturnsPanel: () => null,
}));
// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderPage } from "../src/components/orders/order-page";
import { PlaceOrder } from "../src/components/orders/place-order";
import type { OrderRecord } from "../src/lib/order-api";
import type { Checkout } from "../src/lib/checkout-api";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  auth: { user: { id: "customer" } as { id: string } | null, loading: false },
}));
vi.mock("@/lib/order-api", () => ({ orderRequest: mock.request }));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mock.auth }));
const order: OrderRecord = {
  id: "order-one",
  number: "IRA-0123456789ABCDEF1234",
  ownership: "account",
  status: "PENDING_PAYMENT",
  version: 1,
  created_at: "2026-09-23T12:00:00Z",
  cancelled_at: null,
  currency: "NGN",
  subtotal_minor: "1005",
  product_tax_minor: "101",
  delivery_minor: "505",
  delivery_tax_minor: "51",
  tax_minor: "152",
  total_minor: "1662",
  payment: { state: "NOT_STARTED", available: false },
  reservation: {
    status: "ACTIVE",
    expires_at: "2026-09-23T12:15:00Z",
    eligible: true,
  },
  item_count: 3,
  can_cancel: true,
  contact: {
    email: "customer@example.test",
    address: {
      recipient_name: "Customer",
      phone: "+2348012345678",
      line1: "1 Long Road",
      line2: "",
      city: "Lagos",
      state_code: "LAGOS",
      country_code: "NG",
      postal_code: "",
      locality_code: null,
    },
  },
  calculation: { development_only: true },
  lines: [
    {
      id: "line-one",
      quantity: 3,
      unit_price_minor: "335",
      line_subtotal_minor: "1005",
      tax_minor: "101",
      line_total_minor: "1106",
      snapshot: {
        name: "Historical woven basket",
        sku: "ORIGINAL-SKU",
        options: ["Natural"],
      },
    },
  ],
  history: [{ status: "PENDING_PAYMENT", at: "2026-09-23T12:00:00Z" }],
};
const checkout = {
  id: "checkout-one",
  ownership: "account",
  status: "RESERVED",
  version: 4,
  fingerprint: "reviewed-fingerprint",
} as Checkout;
beforeEach(() => {
  mock.request.mockReset();
  mock.auth.user = { id: "customer" };
  sessionStorage.clear();
});
afterEach(cleanup);
describe("orders", () => {
  it("creates only from the reviewed checkout and keeps the same retry key", async () => {
    mock.request
      .mockRejectedValueOnce(new Error("Temporary network failure"))
      .mockResolvedValueOnce(order);
    const created = vi.fn();
    render(<PlaceOrder checkout={checkout} onCreated={created} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Create order — payment pending" }),
    );
    await screen.findByText("Temporary network failure");
    await user.click(
      screen.getByRole("button", { name: "Create order — payment pending" }),
    );
    await screen.findByRole("link", { name: "View your order" });
    const [first, second] = mock.request.mock.calls;
    expect(first.slice(0, 3)).toEqual([
      "/orders",
      "POST",
      {
        checkout_id: "checkout-one",
        expected_version: 4,
        fingerprint: "reviewed-fingerprint",
      },
    ]);
    expect(second[3]).toBe(first[3]);
    expect(created).toHaveBeenCalledWith("order-one");
    expect(screen.getByText(/payment is still required/)).toBeTruthy();
  });
  it("restores placement retry identity after remount without storing contact or capability", async () => {
    mock.request.mockRejectedValue(new Error("Connection lost"));
    const user = userEvent.setup();
    const r = render(<PlaceOrder checkout={checkout} />);
    await user.click(screen.getByRole("button"));
    await screen.findByText("Connection lost");
    const key = mock.request.mock.calls[0][3];
    r.unmount();
    render(<PlaceOrder checkout={checkout} />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(mock.request).toHaveBeenCalledTimes(2));
    expect(mock.request.mock.calls[1][3]).toBe(key);
    expect(sessionStorage.getItem("iranti-order-create-checkout-one")).toBe(
      key,
    );
  });
  it("shows existing promoted order without another create action", () => {
    render(<PlaceOrder checkout={{ ...checkout, order_id: "existing" }} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/account/orders/existing",
    );
  });
  it("uses the scoped guest detail path and explains limited recovery", async () => {
    mock.request.mockResolvedValue({ ...order, ownership: "guest" });
    render(<PlaceOrder checkout={{ ...checkout, ownership: "guest" }} />);
    await userEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("link")).getAttribute("href")).toBe(
      "/orders/order-one",
    );
    expect(
      screen.getByText(/Email recovery is not available yet/),
    ).toBeTruthy();
  });
  it("renders order list and cursor navigation", async () => {
    mock.request
      .mockResolvedValueOnce({ items: [order], next_cursor: "next" })
      .mockResolvedValueOnce({ items: [], next_cursor: null });
    render(<OrderPage />);
    const link = await screen.findByRole("link", { name: order.number });
    expect(link.getAttribute("href")).toBe("/account/orders/order-one");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("No orders found.");
    expect(mock.request.mock.calls[1][0]).toContain("cursor=next");
  });
  it("renders historical item, address and exact server totals", async () => {
    mock.request.mockResolvedValue(order);
    render(<OrderPage id="order-one" />);
    await screen.findByText("Historical woven basket");
    expect(screen.getByText("SKU ORIGINAL-SKU")).toBeTruthy();
    expect(screen.getByText("₦16.62")).toBeTruthy();
    expect(screen.getByText(/Payment not started/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /pay now/i })).toBeNull();
  });
  it("cancels with current version and preserves cancelled history", async () => {
    mock.request.mockResolvedValueOnce(order).mockResolvedValueOnce({
      ...order,
      status: "CANCELLED",
      version: 2,
      can_cancel: false,
      history: [
        ...order.history!,
        { status: "CANCELLED", at: "2026-09-23T12:01:00Z" },
      ],
    });
    render(<OrderPage id="order-one" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel unpaid order" }),
    );
    await screen.findByText("This order is cancelled.");
    expect(mock.request.mock.calls[1]).toEqual([
      "/orders/order-one/cancel",
      "POST",
      { expected_version: 1, reason: "Customer cancelled before payment" },
    ]);
    expect(
      screen.queryByRole("button", { name: "Cancel unpaid order" }),
    ).toBeNull();
  });
  it("requires a reason for owner admin cancellation and hides it when forbidden", async () => {
    mock.request.mockResolvedValueOnce({ ...order, can_cancel: false });
    const r = render(<OrderPage admin id="order-one" />);
    await screen.findByText(order.number);
    expect(
      screen.queryByRole("button", { name: "Cancel unpaid order" }),
    ).toBeNull();
    r.unmount();
    mock.request.mockResolvedValueOnce(order).mockResolvedValueOnce({
      ...order,
      status: "CANCELLED",
      can_cancel: false,
    });
    render(<OrderPage admin id="order-one" />);
    await userEvent.type(
      await screen.findByLabelText("Cancellation reason"),
      "Customer request",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel unpaid order" }),
    );
    await screen.findByText("This order is cancelled.");
    expect(mock.request.mock.calls.at(-1)).toEqual([
      "/admin/orders/order-one/transitions",
      "POST",
      { expected_version: 1, reason: "Customer request" },
    ]);
  });
  it("filters admin order list explicitly by status and UTC dates", async () => {
    mock.request.mockResolvedValue({ items: [], next_cursor: null });
    render(<OrderPage admin />);
    await screen.findByText("No orders found.");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "CANCELLED");
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    await waitFor(() =>
      expect(mock.request.mock.calls.at(-1)?.[0]).toContain("status=CANCELLED"),
    );
  });
  it("explains expired stock without inventing order cancellation or payment eligibility", async () => {
    mock.request.mockResolvedValue({
      ...order,
      reservation: { ...order.reservation, status: "EXPIRED", eligible: false },
    });
    render(<OrderPage id="order-one" />);
    await screen.findByText(/Stock must be reviewed/);
    expect(screen.getByText(/Your order has been retained/)).toBeTruthy();
  });
  it("shows loading and retryable errors without old private data after identity change", async () => {
    mock.request.mockResolvedValueOnce(order);
    const r = render(<OrderPage id="order-one" />);
    await screen.findByText("Historical woven basket");
    mock.auth.user = { id: "other" };
    mock.request.mockRejectedValue(new Error("Order unavailable"));
    r.rerender(<OrderPage id="order-one" />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Historical woven basket")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
  it("has no automated accessibility violations excluding contrast", async () => {
    mock.request.mockResolvedValue(order);
    const { container } = render(<OrderPage id="order-one" />);
    await screen.findByText("Historical woven basket");
    const require = createRequire(import.meta.url);
    const axe = require("axe-core");
    const report = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(report.violations).toEqual([]);
  });
  it("focuses a newly mounted order loading error after render", async () => {
    mock.request.mockRejectedValue(new Error("Temporary service unavailable"));
    render(<OrderPage id="order-one" />);
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
});
