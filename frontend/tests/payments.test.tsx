// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PaymentPanel,
  type Attempt,
} from "../src/components/payments/payment-panel";
import { AdminPayments } from "../src/components/payments/admin-payments";
import type { OrderRecord } from "../src/lib/order-api";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  auth: {
    user: {
      id: "owner",
      roles: ["owner"],
      authentication_state: "authenticated",
    },
    loading: false,
  },
}));
vi.mock("@/lib/order-api", () => ({ orderRequest: mock.request }));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mock.auth }));
const order = {
  id: "owned-order",
  number: "IRA-12345678901234567890",
  status: "PENDING_PAYMENT",
  total_minor: "1662",
  payment: { state: "NOT_STARTED", available: true },
} as OrderRecord;
const attempt: Attempt = {
  id: "attempt",
  reference: "IRA-P-" + "a".repeat(40),
  method: "card",
  amount_minor: "1662",
  currency: "NGN",
  status: "PENDING",
  created_at: "2026-09-23T12:00:00Z",
  last_checked_at: null,
};
beforeEach(() => {
  mock.request.mockReset();
  mock.auth.user = {
    id: "owner",
    roles: ["owner"],
    authentication_state: "authenticated",
  };
});
afterEach(cleanup);
describe("payments", () => {
  it("sends method and stable key without browser money", async () => {
    mock.request.mockImplementation((path: string, method?: string) =>
      method === "POST"
        ? Promise.reject(new Error("Network interrupted"))
        : Promise.resolve({ order, attempts: [] }),
    );
    render(<PaymentPanel order={order} />);
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "bank_transfer",
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to Paystack" }),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Continue to Paystack" }),
    );
    const calls = mock.request.mock.calls.filter((c) => c[1] === "POST");
    expect(calls[0][2]).toEqual({ method: "bank_transfer" });
    expect(calls[0][3]).toBe(calls[1][3]);
  });
  it("verifies only stored attempt and ignores query success", async () => {
    history.replaceState({}, "", "/?success=true&reference=attacker");
    mock.request
      .mockResolvedValueOnce({ order, attempts: [attempt] })
      .mockResolvedValueOnce({
        order: {
          ...order,
          status: "PAID",
          payment: { state: "SUCCESSFUL", available: false },
        },
        attempts: [{ ...attempt, status: "SUCCEEDED" }],
      });
    render(<PaymentPanel order={order} returning />);
    await screen.findByText(/Payment confirmed/);
    expect(mock.request).toHaveBeenCalledWith(
      "/orders/owned-order/payment-attempts/attempt/verify",
      "POST",
      {},
    );
    expect(
      screen.queryByRole("button", { name: "Continue to Paystack" }),
    ).toBeNull();
  });
  it.each(["PENDING", "REQUIRES_REVIEW", "SUCCESSFUL"])(
    "blocks another payment in %s",
    async (state) => {
      const current = {
        ...order,
        payment: { state, available: state === "PENDING" },
      };
      mock.request.mockResolvedValue({ order: current, attempts: [attempt] });
      render(<PaymentPanel order={current} />);
      await screen.findByText(/Reference:/);
      expect(screen.queryByLabelText("Payment method")).toBeNull();
      expect(screen.getByRole("status").textContent).not.toBe("");
    },
  );
  it.each(["FAILED", "ABANDONED"])(
    "allows retry after provider %s",
    async (state) => {
      const current = { ...order, payment: { state, available: true } };
      mock.request.mockResolvedValue({
        order: current,
        attempts: [{ ...attempt, status: state }],
      });
      render(<PaymentPanel order={current} />);
      await screen.findByRole("button", {
        name: "Retry payment with Paystack",
      });
      expect(screen.getByLabelText("Payment method")).toBeTruthy();
    },
  );
  it("focuses verification status and keeps errors readable", async () => {
    mock.request
      .mockResolvedValueOnce({
        order: { ...order, payment: { state: "PENDING", available: true } },
        attempts: [attempt],
      })
      .mockRejectedValue(new Error("Unable to check payment"));
    render(<PaymentPanel order={order} />);
    await screen.findByText(/Reference:/);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Recheck payment" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("status")),
    );
  });
  it("rejects an unsafe redirect", async () => {
    mock.request.mockImplementation((path: string, method?: string) =>
      Promise.resolve(
        method === "POST"
          ? { ...attempt, authorization_url: "https://evil.example/pay" }
          : { order, attempts: [] },
      ),
    );
    render(<PaymentPanel order={order} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Continue to Paystack" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be verified",
    );
  });
  it("restricts detailed views to reconciliation permission", () => {
    mock.auth.user = {
      id: "staff",
      roles: ["order_processing"],
      authentication_state: "authenticated",
    };
    render(<AdminPayments />);
    expect(screen.getByText(/Owner permission/)).toBeTruthy();
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("owner can reconcile without a manual paid toggle", async () => {
    const row = {
      ...attempt,
      order_id: order.id,
      order_number: order.number,
      checks: 0,
      next_check_at: null,
      review_reason: null,
      financial_hold: false,
      receipts: [],
      history: [],
    };
    mock.request
      .mockResolvedValueOnce({ items: [row], next_cursor: null })
      .mockResolvedValue(row);
    render(<AdminPayments />);
    await screen.findByText(order.number);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Verify with provider" }));
    expect(mock.request).toHaveBeenCalledWith(
      "/admin/payments/attempt/reconcile",
      "POST",
      {},
    );
    expect(screen.queryByRole("button", { name: /mark paid/i })).toBeNull();
  });
});
