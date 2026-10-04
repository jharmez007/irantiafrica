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
  expect(screen.getByText(/Email delivery is not configured/)).toBeTruthy();
  expect(screen.queryByText(/Local email capture is not enabled/)).toBeNull();
});
it("allows configured SMTP without a Mailpit warning and shows queued status", async () => {
  mocks.api.mockResolvedValue({
    data: [],
    meta: { page: 1, last_page: 1, total: 0 },
    mail_setup: "email",
  });
  const toasts: string[] = [];
  const listener = (event: Event) =>
    toasts.push((event as CustomEvent<{ title: string }>).detail.title);
  window.addEventListener("iranti:toast", listener);
  try {
    render(<AdminStaff />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add staff" }),
    );
    expect(screen.getByText(/configured email service/)).toBeTruthy();
    expect(screen.queryByText(/Mailpit/)).toBeNull();
    await userEvent.type(screen.getByLabelText("Name"), "Colleague");
    await userEvent.type(
      screen.getByLabelText("Email"),
      "colleague@example.test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send Invitation" }),
    );
    await waitFor(() =>
      expect(toasts.some((text) => text.includes("queued"))).toBe(true),
    );
  } finally {
    window.removeEventListener("iranti:toast", listener);
  }
});
it("shows a standard error toast when invitation submission fails", async () => {
  mocks.api.mockImplementation((path: string, method?: string) =>
    method === "POST"
      ? Promise.reject(new Error("Invitation could not be queued."))
      : Promise.resolve({
          data: [],
          meta: { page: 1, last_page: 1, total: 0 },
          mail_setup: "email",
        }),
  );
  const toasts: string[] = [];
  const listener = (event: Event) =>
    toasts.push((event as CustomEvent<{ title: string }>).detail.title);
  window.addEventListener("iranti:toast", listener);
  try {
    render(<AdminStaff />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add staff" }),
    );
    await userEvent.type(screen.getByLabelText("Name"), "Colleague");
    await userEvent.type(
      screen.getByLabelText("Email"),
      "colleague@example.test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send Invitation" }),
    );
    await waitFor(() => expect(toasts).toContain("Staff action failed."));
    expect(
      screen.getAllByText("Invitation could not be queued.").length,
    ).toBeGreaterThan(0);
  } finally {
    window.removeEventListener("iranti:toast", listener);
  }
});
it("offers resend for an unenrolled staff member without creating another account", async () => {
  mocks.api.mockResolvedValue({
    data: [
      {
        id: "colleague",
        name: "Colleague",
        email: "colleague@example.test",
        roles: ["inventory_store"],
        status: "active",
        mfa_enrolled: false,
      },
    ],
    meta: { page: 1, last_page: 1, total: 1 },
    mail_setup: "email",
  });
  render(<AdminStaff />);
  await userEvent.click(
    await screen.findByRole("button", { name: "More actions" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Resend setup email" }),
  );
  await waitFor(() =>
    expect(mocks.api).toHaveBeenCalledWith(
      "/staff/colleague/resend-invitation",
      "POST",
    ),
  );
  expect(mocks.api).not.toHaveBeenCalledWith(
    "/staff",
    "POST",
    expect.anything(),
  );
});
it("denies non-owner staff before fetching the staff directory", () => {
  mocks.user.roles = ["inventory_store"];
  render(<AdminStaff />);
  expect(screen.getByRole("alert").textContent).toContain("do not have access");
  expect(mocks.api).not.toHaveBeenCalled();
});
it("uses the compact shared overflow for another staff member's valid controls", async () => {
  mocks.api.mockResolvedValue({
    data: [
      {
        id: "owner",
        name: "Owner",
        email: "owner@example.test",
        roles: ["owner"],
        status: "active",
        mfa_enrolled: true,
      },
      {
        id: "colleague",
        name: "Colleague",
        email: "colleague@example.test",
        roles: ["inventory_store"],
        status: "active",
        mfa_enrolled: true,
      },
    ],
    meta: { page: 1, last_page: 1, total: 2 },
    mail_setup: "local_capture",
  });
  render(<AdminStaff />);
  const trigger = await screen.findByRole("button", { name: "More actions" });
  expect(trigger.getAttribute("class")).toContain(
    "admin-action-trigger--compact",
  );
  expect(screen.getByText(/self-changes restricted/)).toBeTruthy();
  await userEvent.click(trigger);
  expect(screen.getByRole("button", { name: "Change role" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reset MFA" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Disable staff" })).toBeTruthy();
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
