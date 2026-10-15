// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentResult } from "../src/components/payments/payment-result";
import type { OrderRecord } from "../src/lib/order-api";
import { trustedPaystackUrl } from "../src/lib/payment-destination";

const mock = vi.hoisted(() => ({ request: vi.fn(), refreshCart: vi.fn() }));
vi.mock("@/lib/order-api", () => ({ orderRequest: mock.request }));
vi.mock("@/components/cart/cart-provider", () => ({
  useCart: () => ({ refresh: mock.refreshCart }),
}));
const order = {
  id: "owned-order",
  number: "IRA-12345678901234567890",
  ownership: "account",
  status: "PAID",
  total_minor: "1662",
  payment: { state: "SUCCESSFUL", available: false },
} as OrderRecord;
const attempt = {
  id: "attempt-one",
  status: "PENDING",
  amount_minor: "1662",
};
beforeEach(() => {
  mock.request.mockReset();
  mock.refreshCart.mockReset();
  window.history.replaceState({}, "", "/orders/owned-order/payment-return");
});
afterEach(cleanup);

describe("compact payment result", () => {
  it("accepts only the trusted HTTPS Paystack checkout host", () => {
    expect(trustedPaystackUrl("https://checkout.paystack.com/one")).toBe(
      "https://checkout.paystack.com/one",
    );
    for (const unsafe of [
      "http://checkout.paystack.com/one",
      "https://checkout.paystack.com.evil.example/one",
      "https://user@checkout.paystack.com/one",
      "https://checkout.paystack.com:444/one",
    ])
      expect(() => trustedPaystackUrl(unsafe)).toThrow(/could not be verified/);
  });
  it.each(["account", "guest"] as const)(
    "shows verified %s success with the order link and paid amount",
    async (ownership) => {
      mock.request.mockResolvedValue({
        order: { ...order, ownership },
        attempts: [{ ...attempt, status: "SUCCEEDED" }],
      });
      render(<PaymentResult id={order.id} />);
      await screen.findByRole("heading", { name: "Payment successful" });
      expect(mock.refreshCart).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Thank you for your order.")).toBeTruthy();
      expect(screen.getByText("Order reference").tagName).toBe("DT");
      expect(screen.getByText("Amount paid").tagName).toBe("DT");
      expect(screen.getByText(/IRA-12345678901234567890/)).toBeTruthy();
      expect(screen.getByText("₦16.62")).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "View order" }).getAttribute("href"),
      ).toBe(
        `${ownership === "guest" ? "/orders" : "/account/orders"}/${order.id}`,
      );
      expect(
        screen.getByRole("link", { name: "View order" }).className,
      ).toContain("button--primary");
      expect(
        screen.getByRole("link", { name: "Continue shopping" }).className,
      ).toContain("text-link");
      expect(screen.getByRole("status").className).toContain("sr-only");
      expect(mock.request).toHaveBeenCalledWith(
        "/orders/owned-order/payment-status",
      );
      expect(mock.request.mock.calls.some((call) => call[1] === "POST")).toBe(
        false,
      );
    },
  );
  it("ignores query-string success and verifies the owned stored attempt", async () => {
    window.history.replaceState(
      {},
      "",
      "/orders/owned-order/payment-return?success=true&reference=forged",
    );
    const pending = {
      order: {
        ...order,
        status: "PENDING_PAYMENT",
        payment: { state: "PENDING", available: true },
      },
      attempts: [attempt],
    };
    mock.request.mockResolvedValue(pending);
    render(<PaymentResult id={order.id} />);
    await screen.findByText(/Payment is still being confirmed/);
    expect(mock.refreshCart).not.toHaveBeenCalled();
    expect(screen.queryByText("Payment successful")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Try payment again" }),
    ).toBeNull();
    expect(mock.request).toHaveBeenCalledWith(
      "/orders/owned-order/payment-attempts/attempt-one/verify",
      "POST",
      {},
    );
    expect(mock.request.mock.calls.join(" ")).not.toContain("forged");
  });
  it("uses a callback reference only to select an already-owned attempt", async () => {
    window.history.replaceState(
      {},
      "",
      "/orders/owned-order/payment-return?reference=older-owned-reference",
    );
    const pending = {
      order: {
        ...order,
        status: "PENDING_PAYMENT",
        payment: { state: "PENDING", available: true },
      },
      attempts: [
        { ...attempt, id: "newer", reference: "newer-owned-reference" },
        { ...attempt, id: "older", reference: "older-owned-reference" },
      ],
    };
    mock.request.mockResolvedValue(pending);
    render(<PaymentResult id={order.id} />);
    await screen.findByText(/Payment is still being confirmed/);
    expect(mock.request).toHaveBeenCalledWith(
      "/orders/owned-order/payment-attempts/older/verify",
      "POST",
      {},
    );
  });
  it("offers retry only after the backend reports a terminal failure and eligibility", async () => {
    mock.request.mockResolvedValue({
      order: {
        ...order,
        status: "PENDING_PAYMENT",
        payment: { state: "FAILED", available: true },
      },
      attempts: [{ ...attempt, status: "FAILED" }],
    });
    render(<PaymentResult id={order.id} />);
    expect(
      await screen.findByRole("link", { name: "Try payment again" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Try payment again" })
        .getAttribute("href"),
    ).toBe("/checkout");
  });
  it("keeps an uncertain result recoverable without claiming failure", async () => {
    mock.request
      .mockRejectedValueOnce(new Error("Status unavailable"))
      .mockResolvedValueOnce({
        order,
        attempts: [],
      });
    render(<PaymentResult id={order.id} />);
    await screen.findByRole("alert");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByRole("heading", { name: "Payment successful" });
  });
});
