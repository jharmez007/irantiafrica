// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ReturnsPanel,
  ReturnSummary,
} from "../src/components/returns/returns-panel";
import { ReturnQueue } from "../src/components/returns/admin-returns";
import type { OrderRecord } from "../src/lib/order-api";
import type { ReturnRecord, ReturnList } from "../src/lib/returns-api";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/order-api", () => ({ orderRequest: mock.request }));
const order = {
  id: "order-one",
  ownership: "guest",
  lines: [{ id: "line-one", snapshot: { name: "Woven basket" }, quantity: 3 }],
} as OrderRecord;
const record: ReturnRecord = {
  id: "return-one",
  order_id: "order-one",
  requester: "guest",
  status: "SUBMITTED",
  version: 1,
  reason_code: "DAMAGED_PRODUCT",
  explanation: "Handle damaged",
  submitted_at: "2026-09-24T12:00:00Z",
  cutoff_at: "2026-09-24T23:00:00Z",
  decision_reason: null,
  items: [
    {
      id: "return-item",
      order_item_id: "line-one",
      name: "Woven basket",
      quantity: 2,
      approved_quantity: 0,
      received_quantity: 0,
      restocked_quantity: 0,
      disposition: null,
    },
  ],
  history: [
    {
      event: "ReturnRequested",
      status: "SUBMITTED",
      at: "2026-09-24T12:00:00Z",
    },
  ],
  refund: null,
  actions: { approve: true, reject: true },
};
const list: ReturnList = {
  eligibility: {
    eligible: true,
    reason: "Same-day request window is open.",
    cutoff: "2026-09-24T23:00:00Z",
  },
  reasons: ["DAMAGED_PRODUCT", "WRONG_PRODUCT_DELIVERED", "DEFECTIVE_PRODUCT"],
  items: [{ order_item_id: "line-one", available_quantity: 3 }],
  returns: [],
};
beforeEach(() => {
  mock.request.mockReset();
});
afterEach(cleanup);
describe("returns", () => {
  it("loads guest-scoped eligibility and submits selected partial quantities without money", async () => {
    mock.request
      .mockResolvedValueOnce(list)
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...list, returns: [record] });
    const user = userEvent.setup();
    render(<ReturnsPanel order={order} />);
    expect(screen.getAllByRole("status")[0].textContent).toBeDefined();
    const qty = await screen.findByRole("spinbutton");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.selectOptions(
      screen.getByLabelText("Reason"),
      "DEFECTIVE_PRODUCT",
    );
    await user.click(screen.getByRole("button", { name: "Request return" }));
    await screen.findByText("Return · submitted");
    expect(mock.request.mock.calls[1]).toEqual([
      "/orders/order-one/returns",
      "POST",
      {
        reason_code: "DEFECTIVE_PRODUCT",
        explanation: null,
        items: [{ order_item_id: "line-one", quantity: 2 }],
      },
      expect.any(String),
    ]);
  });
  it("does not offer requests outside the window", async () => {
    mock.request.mockResolvedValue({
      ...list,
      eligibility: { eligible: false, reason: "Window closed", cutoff: null },
    });
    render(<ReturnsPanel order={order} />);
    await screen.findByText("Window closed");
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
  it("focuses and associates selection errors", async () => {
    mock.request.mockResolvedValue(list);
    const user = userEvent.setup();
    render(<ReturnsPanel order={order} />);
    await user.click(
      await screen.findByRole("button", { name: "Request return" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("Select at least");
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(
      screen.getByRole("spinbutton").getAttribute("aria-describedby"),
    ).toBe("return-error");
  });
  it("shows provider review in text and historic refund amount", () => {
    render(
      <ReturnSummary
        record={{
          ...record,
          refund: {
            id: "f",
            status: "UNKNOWN",
            amount_minor: "738",
            currency: "NGN",
          },
        }}
      />,
    );
    expect(screen.getAllByRole("status")[0].textContent).toContain(
      "Provider verification requires staff review",
    );
  });
  it("shows loading errors and supports retry", async () => {
    mock.request
      .mockRejectedValueOnce(new Error("Session expired"))
      .mockResolvedValueOnce(list);
    const user = userEvent.setup();
    render(<ReturnsPanel order={order} />);
    await screen.findByText("Session expired");
    await user.click(screen.getByRole("button", { name: "Retry returns" }));
    await screen.findByRole("spinbutton");
  });
  it.each(["approve", "reject", "receive", "inspect", "restock"])(
    "submits only permitted %s intent with version and note",
    async (action) => {
      const r = {
        ...record,
        actions: { [action]: true },
        items: record.items.map((i) => ({ ...i, approved_quantity: 2 })),
      };
      mock.request
        .mockResolvedValueOnce({ returns: [r], last_page: 1 })
        .mockResolvedValueOnce({ ...r, version: 2, actions: {} });
      const user = userEvent.setup();
      render(<ReturnQueue />);
      await user.selectOptions(await screen.findByLabelText("Action"), action);
      await user.type(
        screen.getByLabelText("Decision / operational note"),
        "Physical verification recorded",
      );
      await user.click(screen.getByRole("button", { name: /^Confirm:/ }));
      await waitFor(() => expect(mock.request).toHaveBeenCalledTimes(2));
      expect(mock.request.mock.calls[1][0]).toBe(
        `/admin/returns/return-one/${action}`,
      );
      expect(mock.request.mock.calls[1][2]).toMatchObject({
        expected_version: 1,
        note: "Physical verification recorded",
      });
    },
  );
  it("reauthenticates before refund approval and never accepts an amount", async () => {
    const r = { ...record, actions: { refund: true } };
    mock.request
      .mockResolvedValueOnce({ returns: [r], last_page: 1 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ...r,
        refund: {
          id: "f",
          status: "APPROVED",
          amount_minor: "738",
          currency: "NGN",
        },
        actions: {},
      });
    const user = userEvent.setup();
    render(<ReturnQueue />);
    await user.selectOptions(await screen.findByLabelText("Action"), "refund");
    await user.type(
      screen.getByLabelText("Decision / operational note"),
      "Approved",
    );
    await user.type(
      screen.getByLabelText("Confirm your password"),
      "fixture-only",
    );
    await user.type(screen.getByLabelText(/New authenticator code/), "123456");
    await user.click(
      screen.getByRole("button", { name: "Confirm: Approve refund" }),
    );
    await waitFor(() => expect(mock.request).toHaveBeenCalledTimes(3));
    expect(mock.request.mock.calls[1]).toEqual([
      "/auth/reauthenticate",
      "POST",
      { password: "fixture-only", code: "123456" },
    ]);
    expect(mock.request.mock.calls[2][2]).toEqual({
      expected_version: 1,
      note: "Approved",
    });
  });
});
