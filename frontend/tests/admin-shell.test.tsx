// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminFrame } from "../src/components/admin/admin-frame";
import {
  AdminTable,
  AdminPagination,
  StatusBadge,
} from "../src/components/admin/primitives";
const state = vi.hoisted(() => ({
  path: "/admin/products/new",
  roles: ["owner"],
  permissions: [
    "catalog.read_internal",
    "catalog.create_update",
    "inventory.read",
    "orders.read",
    "payments.reconcile",
    "staff.provision",
    "reports.sales",
    "audit.read",
  ],
  logout: vi.fn(),
  replace: vi.fn(),
  loading: false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    loading: state.loading,
    user: {
      name: "Test owner",
      roles: state.roles,
      authentication_state: "authenticated",
      permissions: state.permissions,
    },
    logout: state.logout,
  }),
}));
beforeEach(() => {
  state.path = "/admin/products/new";
  state.loading = false;
  state.roles = ["owner"];
  state.permissions = [
    "catalog.read_internal",
    "catalog.create_update",
    "inventory.read",
    "orders.read",
    "payments.reconcile",
    "staff.provision",
    "reports.sales",
    "audit.read",
  ];
  state.logout.mockResolvedValue(undefined);
  state.replace.mockReset();
  const memory = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key),
    setItem: (key: string, value: string) => memory.set(key, value),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    (this.querySelector("button") as HTMLElement)?.focus();
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uses the branded screen loader only while protected admin identity initializes", () => {
  state.loading = true;
  render(
    <AdminFrame>
      <h1>Private dashboard</h1>
    </AdminFrame>,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Preparing your workspace",
  );
  expect(
    screen.queryByRole("heading", { name: "Private dashboard" }),
  ).toBeNull();
});
it("marks the nested product route and persists collapsed navigation with accessible names", async () => {
  render(
    <AdminFrame>
      <h1>Add Product</h1>
    </AdminFrame>,
  );
  const nav = screen.getByRole("navigation", { name: "Administration" });
  expect(
    within(nav)
      .getByRole("link", { name: /Products/ })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(within(nav).getByRole("link", { name: /Payments/ })).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Collapse sidebar" }),
  );
  expect(localStorage.getItem("iranti-admin-sidebar")).toBe("collapsed");
  expect(
    screen
      .getByRole("button", { name: "Expand sidebar" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(
    within(nav)
      .getByRole("link", { name: /Products/ })
      .getAttribute("title"),
  ).toBe("Products");
});
it("uses approved grants to hide owner-only areas from operational staff", () => {
  state.roles = ["inventory_store"];
  state.permissions = [
    "catalog.read_internal",
    "inventory.read",
    "inventory.adjust",
    "inventory.movements.read",
    "reports.stock",
  ];
  render(<AdminFrame>Inventory</AdminFrame>);
  const nav = screen.getByRole("navigation", { name: "Administration" });
  expect(within(nav).getByRole("link", { name: /Inventory/ })).toBeTruthy();
  expect(within(nav).getByRole("link", { name: /Products/ })).toBeTruthy();
  expect(within(nav).getByRole("link", { name: /Reports/ })).toBeTruthy();
  for (const label of [
    "Staff",
    "Payments",
    "Orders",
    "Categories",
    "Notifications",
  ])
    expect(
      within(nav).queryByRole("link", { name: new RegExp(label) }),
    ).toBeNull();
});
it("opens a labelled drawer and closes it when a destination is chosen", async () => {
  render(<AdminFrame>Content</AdminFrame>);
  await userEvent.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );
  expect(screen.getByRole("dialog", { name: "Administration" })).toBeTruthy();
  await userEvent.click(
    within(
      screen.getByRole("navigation", { name: "Mobile administration" }),
    ).getByRole("link", { name: /Products/ }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open navigation" }),
  );
});
it("logs out through existing auth and navigates only after success", async () => {
  render(<AdminFrame>Content</AdminFrame>);
  const account = screen.getByRole("button", { name: "Account" });
  await userEvent.click(account);
  await userEvent.click(screen.getByRole("button", { name: "Logout" }));
  expect(account.getAttribute("aria-expanded")).toBe("false");
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
  expect(state.logout).toHaveBeenCalledOnce();
});
it("opens and toggles the Account popover with accessible state and natural Tab order", async () => {
  render(<AdminFrame>Content</AdminFrame>);
  const account = screen.getByRole("button", { name: "Account" });
  expect(account.getAttribute("aria-expanded")).toBe("false");
  await userEvent.click(account);
  expect(account.getAttribute("aria-expanded")).toBe("true");
  expect(
    document.getElementById(account.getAttribute("aria-controls")!),
  ).toBeTruthy();
  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("link", { name: "My account" }),
  );
  await userEvent.click(account);
  expect(account.getAttribute("aria-expanded")).toBe("false");
});
it("dismisses Account on outside pointer, Escape, route change and selection", async () => {
  const view = render(<AdminFrame>Content</AdminFrame>);
  const account = screen.getByRole("button", { name: "Account" });
  await userEvent.click(account);
  await userEvent.click(screen.getByText("Content"));
  expect(account.getAttribute("aria-expanded")).toBe("false");
  await userEvent.click(account);
  await userEvent.keyboard("{Escape}");
  expect(account.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(account);
  await userEvent.click(account);
  state.path = "/admin/orders";
  view.rerender(<AdminFrame>Content</AdminFrame>);
  await waitFor(() =>
    expect(account.getAttribute("aria-expanded")).toBe("false"),
  );
  await userEvent.click(account);
  await userEvent.click(screen.getByRole("link", { name: "My account" }));
  expect(account.getAttribute("aria-expanded")).toBe("false");
});
it("wraps drawer keyboard focus in both directions", async () => {
  render(<AdminFrame>Content</AdminFrame>);
  await userEvent.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );
  const drawer = screen.getByRole("dialog");
  const first = within(drawer).getByRole("button", {
    name: "Close administration",
  });
  const last = within(drawer).getByRole("link", { name: /View storefront/ });
  first.focus();
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(last);
  await userEvent.tab();
  expect(document.activeElement).toBe(first);
});
it("provides semantic table loading, empty state and bounded pagination", async () => {
  const change = vi.fn();
  const r = render(
    <AdminTable label="Products" columns={["Name", "Status"]} loading />,
  );
  expect(screen.getByRole("status").textContent).toContain("Loading products");
  r.rerender(
    <AdminTable
      label="Products"
      columns={["Name", "Status"]}
      empty
      pagination={<AdminPagination page={1} last={2} change={change} />}
    />,
  );
  expect(screen.getByText("No records to show.")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(change).toHaveBeenCalledWith(2);
});
it("uses text as well as an icon for status", () => {
  render(<StatusBadge value="PAYMENT_REVIEW" />);
  expect(screen.getByText("Payment review")).toBeTruthy();
});
