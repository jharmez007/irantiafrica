// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminStaff } from "../src/components/staff/admin-staff";
const mocks = vi.hoisted(() => ({
  user: {
    id: "owner",
    roles: ["owner"],
    authentication_state: "authenticated",
  },
  api: vi.fn(),
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("@/lib/catalog-admin-api", () => ({ catalogAdmin: mocks.api }));
afterEach(cleanup);
beforeEach(() => {
  mocks.api.mockReset();
  mocks.user = {
    id: "owner",
    roles: ["owner"],
    authentication_state: "authenticated",
  };
  mocks.api.mockResolvedValue({
    data: [],
    meta: { page: 1, last_page: 1, total: 0 },
    mail_setup: "local_capture",
  });
});
it("invites with only name/email/approved role and explains local capture", async () => {
  render(<AdminStaff />);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Add staff" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
  await userEvent.type(screen.getByLabelText("Name"), "Store colleague");
  await userEvent.type(screen.getByLabelText("Email"), "store@example.test");
  await userEvent.selectOptions(
    screen.getByLabelText("Role"),
    "inventory_store",
  );
  expect(
    screen.getByRole("link", { name: "Mailpit" }).getAttribute("href"),
  ).toBe("http://127.0.0.1:8025");
  await userEvent.click(
    screen.getByRole("button", { name: "Send Invitation" }),
  );
  await waitFor(() =>
    expect(mocks.api).toHaveBeenCalledWith("/staff", "POST", {
      name: "Store colleague",
      email: "store@example.test",
      role: "inventory_store",
    }),
  );
  expect(screen.queryByLabelText("Employee password")).toBeNull();
});
it("does not promise setup email when the local sink cannot deliver", async () => {
  mocks.api.mockResolvedValue({
    data: [],
    meta: { page: 1, last_page: 1, total: 0 },
    mail_setup: "unavailable",
  });
  render(<AdminStaff />);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Add staff" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Send Invitation",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText(/Local email capture is not enabled/)).toBeTruthy();
});
it("denies non-owner staff before fetching the staff directory", () => {
  mocks.user.roles = ["inventory_store"];
  render(<AdminStaff />);
  expect(screen.getByRole("alert").textContent).toContain("do not have access");
  expect(mocks.api).not.toHaveBeenCalled();
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
