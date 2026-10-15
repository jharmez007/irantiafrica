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
    await screen.findByText("Payment successful");
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
      await screen.findByText("Payment details");
      expect(screen.getByText("Payment details").closest("details")?.open).toBe(
        false,
      );
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
  it.each([
    ["PENDING", "PENDING", "Awaiting confirmation"],
    ["PENDING", "UNKNOWN", "Unable to confirm payment status"],
    ["SUCCESSFUL", "SUCCEEDED", "Payment successful"],
    ["FAILED", "FAILED", "Payment unsuccessful"],
    ["REQUIRES_REVIEW", "UNKNOWN", "Unable to confirm payment status"],
  ])(
    "uses customer-facing copy for %s / %s",
    async (state, attemptStatus, expected) => {
      const current = {
        ...order,
        payment: { state, available: false },
      };
      mock.request.mockResolvedValue({
        order: current,
        attempts: [{ ...attempt, status: attemptStatus }],
      });
      render(<PaymentPanel order={current} compact />);
      await screen.findByText("Payment details");
      expect(screen.getByRole("status").textContent).toContain(expected);
      expect(screen.getByRole("status").textContent).not.toMatch(
        /UNKNOWN|hosted/,
      );
      expect(screen.getByText("Payment details").closest("details")?.open).toBe(
        false,
      );
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
    await screen.findByText("Payment details");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Check payment status" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("status")),
    );
  });
  it("shows a clear result when an unknown attempt remains unconfirmed", async () => {
    const pending = {
      ...order,
      payment: { state: "PENDING", available: false },
    };
    const unknown = {
      ...attempt,
      status: "UNKNOWN",
      last_checked_at: "2026-10-15T00:10:00Z",
    };
    mock.request
      .mockResolvedValueOnce({ order: pending, attempts: [unknown] })
      .mockResolvedValueOnce({ order: pending, attempts: [unknown] })
      .mockResolvedValueOnce({
        order: pending,
        attempts: [{ ...unknown, last_checked_at: "2026-10-15T00:11:00Z" }],
      });
    render(<PaymentPanel order={pending} compact />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Check payment status" }),
    );
    await screen.findByText(
      /We tried again, but the payment status is still unconfirmed/,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Unable to confirm payment status",
    );
    expect(
      mock.request.mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(1);
  });
  it("shows the last local check time and a safe next step for exhausted uncertainty", async () => {
    const pending = {
      ...order,
      payment: { state: "PENDING", available: false },
      reservation: {
        status: "EXPIRED",
        expires_at: "2026-10-15T00:00:00Z",
        eligible: false,
      },
    } as OrderRecord;
    mock.request.mockResolvedValue({
      order: pending,
      attempts: [
        {
          ...attempt,
          status: "UNKNOWN",
          failure_code: "RECONCILIATION_EXHAUSTED",
          last_checked_at: "2026-10-15 07:28:22+00",
        },
      ],
    });
    render(<PaymentPanel order={pending} compact />);
    await screen.findByText(/Last checked 15 Oct 2026, 08:28 WAT/);
    expect(screen.getByRole("status").textContent).toContain(
      "Repeated checks have not confirmed this payment. Do not make another payment.",
    );
    expect(screen.getByRole("status").textContent).not.toMatch(
      /UNKNOWN|RECONCILIATION_EXHAUSTED/,
    );
  });
  it("explains when no fresh verification completed", async () => {
    const pending = {
      ...order,
      payment: { state: "PENDING", available: false },
    };
    const unknown = { ...attempt, status: "UNKNOWN", last_checked_at: null };
    mock.request.mockResolvedValue({ order: pending, attempts: [unknown] });
    render(<PaymentPanel order={pending} compact />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Check payment status" }),
    );
    await screen.findByText(/No new payment confirmation was available/);
  });
  it("refreshes a terminal attempt without verifying it again", async () => {
    const failed = {
      ...order,
      payment: { state: "FAILED", available: false },
    };
    mock.request.mockResolvedValue({
      order: failed,
      attempts: [{ ...attempt, status: "FAILED" }],
    });
    render(<PaymentPanel order={failed} compact />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Check payment status" }),
    );
    await screen.findByText(/The payment was unsuccessful/);
    expect(mock.request.mock.calls.some((call) => call[1] === "POST")).toBe(
      false,
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
    await userEvent.click(screen.getByRole("button", { name: "View" }));
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
  it("organizes payment evidence without hiding earlier history", async () => {
    const row = {
      ...attempt,
      order_id: order.id,
      order_number: order.number,
      checks: 6,
      next_check_at: null,
      review_reason: "RECONCILIATION_EXHAUSTED",
      financial_hold: true,
      receipts: [
        {
          amount_minor: "1662",
          currency: "NGN",
          channel: "card",
          verified_at: "2026-10-15T12:00:00Z",
          applied_at: null,
          exception_code: "ORDER_NOT_ELIGIBLE",
          verification_source: "manual",
        },
      ],
      history: Array.from({ length: 6 }, (_, index) => ({
        source: "manual_review",
        outcome: "UNKNOWN",
        status: "UNKNOWN",
        created_at: `2026-10-15T${String(12 - index).padStart(2, "0")}:00:00Z`,
      })),
    };
    mock.request
      .mockResolvedValueOnce({ items: [row], next_cursor: null })
      .mockResolvedValueOnce(row);
    render(<AdminPayments />);
    await userEvent.click(await screen.findByRole("button", { name: "View" }));
    const dialog = screen.getByRole("dialog", { name: "Payment details" });
    expect(within(dialog).getByText(attempt.reference)).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "Review required" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Unapplied — review required"),
    ).toBeTruthy();
    expect(within(dialog).getByText("15 Oct 2026, 13:00 WAT")).toBeTruthy();
    const earlier = within(dialog)
      .getByText("Show 2 earlier events")
      .closest("details");
    expect(earlier?.open).toBe(false);
    await userEvent.click(within(dialog).getByText("Show 2 earlier events"));
    expect(earlier?.open).toBe(true);
    expect(within(dialog).getAllByText(/manual review/)).toHaveLength(6);
  });
});

// jsdom needs the native dialog open/close state; focus behavior is checked in Chrome.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
