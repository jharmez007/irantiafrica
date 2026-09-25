// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminDashboard } from "../src/components/reporting/admin-dashboard";
import { reportingFixture, ownerPermissions } from "./fixtures/reporting";
import type { Identity } from "../src/lib/auth-api";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  user: null as Identity | null,
}));
vi.mock("@/lib/order-api", () => ({ orderRequest: mock.request }));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: mock.user, loading: false }),
}));
beforeEach(() => {
  mock.user = {
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    email_verified: true,
    authentication_state: "authenticated",
    permissions: ownerPermissions,
  };
  mock.request.mockReset().mockResolvedValue(reportingFixture);
});
afterEach(cleanup);
describe("operational dashboard", () => {
  it("renders authoritative totals, operational queues and historical product data", async () => {
    render(<AdminDashboard />);
    expect(
      await screen.findByRole("heading", { name: "Sales and collections" }),
    ).toBeTruthy();
    expect(screen.getByText("Net collections")).toBeTruthy();
    expect(screen.getByText("Low-stock variants")).toBeTruthy();
    expect(
      screen.getByText(
        "Historical handwoven basket with a long descriptive name",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Open return queue")).toBeTruthy();
    expect(screen.getByText("Recent payment issues")).toBeTruthy();
    expect(screen.getByText("pending payment")).toBeTruthy();
  });
  it("sends server presets and explicit custom dates, never browser-computed boundaries", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByText("Net collections");
    await user.selectOptions(screen.getByLabelText("Date range"), "custom");
    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-09-01");
    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2026-09-10");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(mock.request).toHaveBeenLastCalledWith(
        "/admin/dashboard?range=custom&page=1&stock=all&from=2026-09-01&to=2026-09-10",
      ),
    );
  });
  it("limits inventory staff to stock and removes cached owner data after role change", async () => {
    const { rerender } = render(<AdminDashboard />);
    await screen.findByText("Net collections");
    mock.user = { ...mock.user!, permissions: ["reports.stock"] };
    mock.request.mockResolvedValue({
      range: reportingFixture.range,
      as_of: reportingFixture.as_of,
      stock: reportingFixture.stock,
    });
    rerender(<AdminDashboard />);
    expect(screen.queryByText("Net collections")).toBeNull();
    await screen.findByText("Low-stock variants");
    expect(screen.queryByRole("option", { name: "Sales" })).toBeNull();
    expect(screen.queryByText("Payment operations")).toBeNull();
  });
  it("shows empty state instead of inventing rows", async () => {
    mock.request.mockResolvedValue({
      range: reportingFixture.range,
      as_of: reportingFixture.as_of,
      products: {
        scope: "No applied sales",
        items: [],
        pagination: { page: 1, last_page: 1, total: 0 },
      },
    });
    render(<AdminDashboard />);
    expect(
      await screen.findByText("No product performance to show."),
    ).toBeTruthy();
    expect(screen.queryByText("Net collections")).toBeNull();
  });
  it("handles loading, error and retry without stale data", async () => {
    mock.request.mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<AdminDashboard />);
    expect(
      await screen.findByText("Loading operational reports…"),
    ).toBeTruthy();
    view.unmount();
    mock.request.mockRejectedValueOnce(new Error("Reports unavailable"));
    render(<AdminDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    mock.request.mockResolvedValue(reportingFixture);
    await userEvent.click(
      screen.getByRole("button", { name: "Retry reports" }),
    );
    expect(await screen.findByText("Net collections")).toBeTruthy();
  });
  it("paginates selected detail and resets page when filters change", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByText("Net collections");
    await user.selectOptions(screen.getByLabelText("Report"), "orders");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await user.click(await screen.findByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(mock.request).toHaveBeenLastCalledWith(
        "/admin/reports/orders?range=30d&page=2&stock=all",
      ),
    );
  });
  it("does not request reports without authorized identity", () => {
    mock.user = null;
    render(<AdminDashboard />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(mock.request).not.toHaveBeenCalled();
  });
});
