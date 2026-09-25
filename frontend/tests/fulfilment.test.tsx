// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { paymentMessage } from "../src/components/payments/payment-panel";
import { FulfilmentPanel } from "../src/components/orders/fulfilment-panel";
import type { OrderRecord, Shipment } from "../src/lib/order-api";
import { CheckoutError } from "../src/lib/checkout-api";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/order-api", () => ({ orderRequest: mock.request }));
const shipment: Shipment = {
  status: "SHIPPED",
  provider_label: "Carrier with a long name",
  tracking_number: "TRACK-" + "A".repeat(150),
  tracking_url: "https://tracking.example.test/" + "b".repeat(1000),
  shipped_at: "2026-09-24T12:00:00Z",
  delivered_at: null,
};
function order(
  status: OrderRecord["status"] = "PAID",
  admin = false,
): OrderRecord {
  return {
    id: "order-one",
    number: "IRA-123",
    status,
    version: 3,
    history: [
      { status: "PENDING_PAYMENT", at: "2026-09-24T10:00:00Z" },
      { status: "PAID", at: "2026-09-24T11:00:00Z" },
      ...(status !== "PAID" ? [{ status, at: "2026-09-24T12:00:00Z" }] : []),
    ],
    shipment: status === "SHIPPED" ? shipment : null,
    ...(admin
      ? {
          fulfilment: {
            shipment:
              status === "PROCESSING"
                ? {
                    ...shipment,
                    id: "shipment-one",
                    status: "PREPARED",
                    shipped_at: null,
                    operational_notes: "Private note",
                    delivery_evidence: null,
                  }
                : status === "SHIPPED"
                  ? {
                      ...shipment,
                      id: "shipment-one",
                      operational_notes: "Private note",
                      delivery_evidence: null,
                    }
                  : null,
            payment_verified: true,
            blocked: false,
            actions: {
              processing: status === "PAID",
              save: status === "PROCESSING",
              ship: status === "PROCESSING",
              deliver: status === "SHIPPED",
            },
          },
        }
      : {}),
  } as OrderRecord;
}
beforeEach(() => {
  mock.request.mockReset();
});
afterEach(cleanup);
describe("manual fulfilment", () => {
  it("shows only recorded customer milestones and no premature tracking", () => {
    render(<FulfilmentPanel order={order()} changed={vi.fn()} />);
    expect(screen.getByText("Order received")).toBeTruthy();
    expect(screen.getByText("Payment confirmed")).toBeTruthy();
    expect(screen.queryByText("Delivered")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Tracking details will appear after dispatch."),
    ).toBeTruthy();
  });
  it("uses the same safe guest tracking and wraps long values via the shared panel", () => {
    render(
      <FulfilmentPanel
        order={{ ...order("SHIPPED"), ownership: "guest" }}
        changed={vi.fn()}
      />,
    );
    expect(screen.getByText(shipment.tracking_number!)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Track your shipment/ });
    expect(link.getAttribute("href")).toBe(shipment.tracking_url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByText("Private note")).toBeNull();
  });
  it("rejects unsafe external tracking schemes defensively", () => {
    render(
      <FulfilmentPanel
        order={{
          ...order("SHIPPED"),
          shipment: { ...shipment, tracking_url: "javascript:alert(1)" },
        }}
        changed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("begins processing with the expected version and focuses live feedback", async () => {
    const changed = vi.fn();
    mock.request.mockResolvedValue(order("PROCESSING", true));
    render(
      <FulfilmentPanel order={order("PAID", true)} admin changed={changed} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Begin processing" }),
    );
    expect(mock.request).toHaveBeenCalledWith(
      "/admin/orders/order-one/processing",
      "POST",
      { expected_version: 3, note: null },
    );
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });
  it("creates optional draft tracking then updates through the shipment endpoint", async () => {
    const o = order("PROCESSING", true);
    o.fulfilment!.shipment = null;
    o.fulfilment!.actions.ship = false;
    mock.request.mockResolvedValue(o);
    render(<FulfilmentPanel order={o} admin changed={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Carrier name"),
      "Independent carrier",
    );
    await user.click(screen.getByRole("button", { name: "Create shipment" }));
    expect(mock.request).toHaveBeenCalledWith(
      "/admin/orders/order-one/shipment",
      "POST",
      expect.objectContaining({
        provider_label: "Independent carrier",
        tracking_number: null,
        tracking_url: null,
        expected_version: 3,
      }),
    );
  });
  it("saves draft corrections with PATCH and never sends arbitrary status", async () => {
    mock.request.mockResolvedValue(order("PROCESSING", true));
    render(
      <FulfilmentPanel
        order={order("PROCESSING", true)}
        admin
        changed={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save shipment details" }),
    );
    expect(mock.request.mock.calls[0][1]).toBe("PATCH");
    expect(mock.request.mock.calls[0][2]).not.toHaveProperty("status");
  });
  it("shows field validation errors associated with inputs and focuses the alert", async () => {
    mock.request.mockRejectedValue(
      new CheckoutError(422, "VALIDATION", "Invalid input", {
        tracking_url: ["Use an approved carrier hostname."],
      }),
    );
    render(
      <FulfilmentPanel
        order={order("PROCESSING", true)}
        admin
        changed={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save shipment details" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Use an approved carrier hostname.");
    expect(
      screen
        .getByLabelText("HTTPS tracking URL")
        .getAttribute("aria-describedby"),
    ).toBe(alert.id);
    expect(document.activeElement).toBe(alert);
  });
  it("requires delivery evidence and hides dispatch on shipped orders", async () => {
    mock.request.mockResolvedValue(order("DELIVERED", true));
    render(
      <FulfilmentPanel
        order={order("SHIPPED", true)}
        admin
        changed={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Mark dispatched" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm delivered" }),
    );
    expect(mock.request).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText("Delivery confirmation evidence"),
      "Carrier receipt ABC",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm delivered" }),
    );
    expect(mock.request).toHaveBeenCalledWith(
      "/admin/orders/order-one/deliver",
      "POST",
      { expected_version: 3, note: "Carrier receipt ABC" },
    );
  });
  it("hides mutations when backend permissions or financial guards deny them", () => {
    const o = order("PROCESSING", true);
    o.fulfilment!.blocked = true;
    o.fulfilment!.actions = {
      processing: false,
      save: false,
      ship: false,
      deliver: false,
    };
    render(<FulfilmentPanel order={o} admin changed={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(/Preparation and dispatch are unavailable/),
    ).toBeTruthy();
  });
  it("prevents duplicate requests while pending", async () => {
    let resolve!: (value: OrderRecord) => void;
    mock.request.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(
      <FulfilmentPanel order={order("PAID", true)} admin changed={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.dblClick(
      screen.getByRole("button", { name: "Begin processing" }),
    );
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Updating…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    resolve(order("PROCESSING", true));
    await screen.findByText("Order processing started.");
  });
  it("discards an old response after the order view unmounts", async () => {
    let resolve!: (value: OrderRecord) => void;
    mock.request.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const changed = vi.fn();
    const view = render(
      <FulfilmentPanel order={order("PAID", true)} admin changed={changed} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Begin processing" }),
    );
    view.unmount();
    resolve(order("PROCESSING", true));
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });
  it("refreshes the editable fields when a newer server version arrives", () => {
    const view = render(
      <FulfilmentPanel
        order={order("PROCESSING", true)}
        admin
        changed={vi.fn()}
      />,
    );
    const o = order("PROCESSING", true);
    o.version = 4;
    o.fulfilment!.shipment!.tracking_number = "NEW REFERENCE";
    view.rerender(<FulfilmentPanel order={o} admin changed={vi.fn()} />);
    expect(
      (screen.getByLabelText("Tracking number") as HTMLInputElement).value,
    ).toBe("NEW REFERENCE");
  });
  it("requires saving edited tracking before dispatch", async () => {
    render(
      <FulfilmentPanel
        order={order("PROCESSING", true)}
        admin
        changed={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText("Tracking number"), "X");
    expect(
      screen
        .getByRole("button", { name: "Mark dispatched" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText("Save your shipment changes before dispatching."),
    ).toBeTruthy();
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("shows delivered time and no further staff mutation", () => {
    const o = order("DELIVERED", true);
    o.fulfilment!.shipment = {
      ...shipment,
      id: "shipment-one",
      status: "DELIVERED",
      delivered_at: "2026-09-24T14:00:00Z",
      operational_notes: "Private note",
      delivery_evidence: "Receipt ABC",
    };
    render(<FulfilmentPanel order={o} admin changed={vi.fn()} />);
    expect(screen.getByText("Delivery confirmed by staff")).toBeTruthy();
    expect(screen.getByText("Delivery evidence: Receipt ABC")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("does not deny an already recorded shipment in payment messaging", () => {
    for (const state of ["SHIPPED", "DELIVERED"]) {
      expect(paymentMessage("SUCCESSFUL", state)).not.toContain(
        "Shipment has not been confirmed",
      );
    }
    expect(paymentMessage("SUCCESSFUL", "PAID")).toContain(
      "Shipment has not been confirmed",
    );
    expect(paymentMessage("REQUIRES_REVIEW", "SHIPPED")).toContain(
      "Payment requires review",
    );
  });
});
