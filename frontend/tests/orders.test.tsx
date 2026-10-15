vi.mock("@/components/returns/returns-panel", () => ({
  ReturnsPanel: () => null,
}));
// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderPage } from "../src/components/orders/order-page";
import type { OrderRecord } from "../src/lib/order-api";
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
        image: {
          id: "order-image",
          variant_id: "variant-one",
          alt_text: "Natural woven basket",
          position: 0,
          width: 640,
          height: 480,
          sources: [{ url: "/order-image.webp", width: 640, height: 480 }],
        },
      },
    },
  ],
  history: [{ status: "PENDING_PAYMENT", at: "2026-09-23T12:00:00Z" }],
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  mock.request.mockReset();
  mock.auth.user = { id: "customer" };
  sessionStorage.clear();
});
afterEach(cleanup);
describe("orders", () => {
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
    expect(screen.queryByText("SKU ORIGINAL-SKU")).toBeNull();
    expect(
      screen.getByAltText("Natural woven basket").getAttribute("src"),
    ).toBe("/order-image.webp");
    expect(screen.getByText("₦16.62")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your items" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Delivery details" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Order activity" }),
    ).toBeTruthy();
    expect(screen.getByText("Line total (incl. tax)")).toBeTruthy();
    expect(
      screen.queryByText("These amounts are the historical order snapshot."),
    ).toBeNull();
    expect(screen.getByText(/Payment not started/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /pay now/i })).toBeNull();
  });
  it("keeps long historical product names and large stored amounts intact", async () => {
    const longName =
      "Hand-finished heritage woven travel basket with a removable leather shoulder strap and embroidered lining";
    const largeTotal = "123456789";
    mock.request.mockResolvedValue({
      ...order,
      total_minor: largeTotal,
      lines: [
        {
          ...order.lines![0],
          line_total_minor: largeTotal,
          snapshot: { ...order.lines![0].snapshot, name: longName },
        },
      ],
    });
    render(<OrderPage id="order-one" />);
    expect(await screen.findByRole("heading", { name: longName })).toBeTruthy();
    expect(screen.getAllByText("₦1,234,567.89")).toHaveLength(2);
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
      await screen.findByRole("button", { name: "Cancel order" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Cancel this order?" }),
    ).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel order",
      }),
    );
    await screen.findByText("This order is cancelled.");
    expect(mock.request.mock.calls[1]).toEqual([
      "/orders/order-one/cancel",
      "POST",
      { expected_version: 1, reason: "Customer cancelled before payment" },
    ]);
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });
  it("dismisses cancellation with Escape and restores focus without submitting", async () => {
    mock.request.mockResolvedValue(order);
    render(<OrderPage id="order-one" />);
    const trigger = await screen.findByRole("button", { name: "Cancel order" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Cancel this order?" });
    fireEvent(dialog, new Event("cancel", { cancelable: true, bubbles: true }));
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));
    expect(document.activeElement).toBe(trigger);
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
  it("keeps a failed cancellation visible in its dialog", async () => {
    mock.request
      .mockResolvedValueOnce(order)
      .mockRejectedValueOnce(new Error("Order changed"));
    render(<OrderPage id="order-one" />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel order" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel order",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Order changed",
    );
    expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
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
  it("shows saved order images and totals in the admin item overview", async () => {
    mock.request.mockResolvedValueOnce(order);
    render(<OrderPage admin id="order-one" />);
    expect(
      await screen.findByRole("heading", { name: "Historical woven basket" }),
    ).toBeTruthy();
    expect(
      screen.getByAltText("Natural woven basket").getAttribute("src"),
    ).toBe("/order-image.webp");
    expect(screen.getByText("SKU ORIGINAL-SKU")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Order total" })).toBeTruthy();
    expect(screen.getByText("₦16.62")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Delivery details" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fulfilment" })).toBeTruthy();
  });
  it("shows an accessible fallback when an order image was not saved", async () => {
    mock.request.mockResolvedValueOnce({
      ...order,
      lines: [
        {
          ...order.lines![0],
          snapshot: { ...order.lines![0].snapshot, image: null },
        },
      ],
    });
    render(<OrderPage admin id="order-one" />);
    await screen.findByRole("heading", { name: "Historical woven basket" });
    expect(
      screen.getByRole("img", { name: "No product image available" }),
    ).toBeTruthy();
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
    await screen.findByText(/stock reservation has ended/);
    expect(
      screen.queryByRole("button", { name: "Continue to Paystack" }),
    ).toBeNull();
  });
  it("keeps an opened tax breakdown while checking the existing payment", async () => {
    const pending = {
      ...order,
      can_cancel: false,
      payment: { state: "PENDING", available: false },
    };
    const paymentSummary = {
      order: pending,
      attempts: [
        {
          id: "attempt-one",
          reference: "IRA-P-REFERENCE",
          method: "card",
          amount_minor: pending.total_minor,
          currency: "NGN",
          status: "UNKNOWN",
          created_at: pending.created_at,
          last_checked_at: null,
        },
      ],
    };
    mock.request.mockImplementation((path: string) =>
      Promise.resolve(path === "/orders/order-one" ? pending : paymentSummary),
    );
    render(<OrderPage id="order-one" />);
    const tax = await screen.findByText("Tax breakdown");
    await userEvent.click(tax);
    expect(tax.closest("details")?.open).toBe(true);
    await userEvent.click(
      await screen.findByRole("button", { name: "Check payment status" }),
    );
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some((call) =>
          String(call[0]).includes("/payment-attempts/attempt-one/verify"),
        ),
      ).toBe(true),
    );
    await screen.findByText(/No new payment confirmation was available/);
    expect(tax.closest("details")?.open).toBe(true);
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
