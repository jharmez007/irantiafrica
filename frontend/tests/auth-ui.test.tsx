// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "../src/components/auth-form";
import { MfaScreen } from "../src/components/mfa-screen";
import { AccountBoundary } from "../src/components/account-boundary";
import type { Identity } from "../src/lib/auth-api";

const mocks = vi.hoisted(() => ({
  user: null as Identity | null,
  request: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/login",
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: mocks.user,
    loading: false,
    error: "",
    refresh: mocks.refresh,
    logout: mocks.logout,
  }),
}));
vi.mock("@/lib/auth-api", async (original) => ({
  ...(await original<typeof import("../src/lib/auth-api")>()),
  authRequest: mocks.request,
}));
const customer: Identity = {
  id: "user",
  name: "Test customer",
  email: "customer@example.test",
  email_verified: false,
  roles: [],
  authentication_state: "authenticated",
};
beforeEach(() => {
  mocks.user = null;
  mocks.request.mockReset();
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.logout.mockReset().mockResolvedValue(undefined);
  mocks.replace.mockReset();
  window.history.replaceState(null, "", "/login");
});
afterEach(cleanup);
describe("branded authentication forms", () => {
  it.each(["login", "register", "forgot", "reset"] as const)(
    "%s never defaults to a credential-bearing native GET before hydration",
    (mode) => {
      const { container } = render(<AuthForm mode={mode} />);
      expect(container.querySelector("form")?.getAttribute("method")).toBe(
        "post",
      );
    },
  );
  it("reveals the password without submitting and preserves sign-in routing", async () => {
    mocks.request.mockResolvedValue({
      ...customer,
      roles: ["owner"],
      authentication_state: "mfa_required",
    });
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    await user.type(screen.getByLabelText("Email"), customer.email);
    await user.type(password, "A secure passphrase");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    expect(mocks.request).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("/auth/login", {
        email: customer.email,
        password: "A secure passphrase",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/mfa");
  });
  it("retains registration password constraints and accessible errors", async () => {
    mocks.request.mockRejectedValue(
      new Error("Unable to create this account."),
    );
    const user = userEvent.setup();
    render(<AuthForm mode="register" />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.minLength).toBe(12);
    expect(password.maxLength).toBe(72);
    await user.type(screen.getByLabelText("Name"), customer.name);
    await user.type(screen.getByLabelText("Email"), customer.email);
    await user.type(password, "A secure passphrase");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "A secure passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unable to create this account.",
    );
  });
  it("keeps reset credentials out of the URL and sends them only with the reset submission", async () => {
    window.history.replaceState(
      null,
      "",
      "/reset-password#email=customer%40example.test&token=secret-reset-token",
    );
    mocks.request.mockResolvedValue({ message: "Password changed." });
    const user = userEvent.setup();
    render(<AuthForm mode="reset" />);
    expect(window.location.hash).toBe("");
    expect(screen.queryByText("secret-reset-token")).toBeNull();
    await user.type(
      screen.getByLabelText("Password"),
      "A new unique passphrase",
    );
    await user.type(
      screen.getByLabelText("Confirm password"),
      "A new unique passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("/auth/password/reset", {
        email: customer.email,
        token: "secret-reset-token",
        password: "A new unique passphrase",
        password_confirmation: "A new unique passphrase",
      }),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Password changed.",
    );
  });
  it("preserves recovery-code challenge mode and the successful account redirect", async () => {
    mocks.user = {
      ...customer,
      roles: ["owner"],
      authentication_state: "mfa_required",
    };
    mocks.request.mockResolvedValue({});
    const user = userEvent.setup();
    render(<MfaScreen />);
    expect(
      (screen.getByLabelText("Authenticator code") as HTMLInputElement)
        .maxLength,
    ).toBe(6);
    await user.click(screen.getByLabelText("Use a recovery code"));
    const recovery = screen.getByLabelText("Recovery code") as HTMLInputElement;
    expect(recovery.type).toBe("password");
    expect(recovery.maxLength).toBe(32);
    await user.type(recovery, "0123456789abcdef0123456789abcdef");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("/auth/mfa/challenge", {
        code: "0123456789abcdef0123456789abcdef",
        recovery: true,
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/account");
  });
  it("shows recovery codes once after staff enrollment and clears them on acknowledgement", async () => {
    mocks.user = {
      ...customer,
      roles: ["owner"],
      authentication_state: "enrollment_required",
    };
    mocks.request
      .mockResolvedValueOnce({
        secret: "MANUAL-SETUP-KEY",
        qr: "data:image/svg+xml;base64,PHN2Zy8+",
      })
      .mockResolvedValueOnce({ recovery_codes: ["one-time-recovery-code"] });
    const user = userEvent.setup();
    render(<MfaScreen />);
    await user.click(
      screen.getByRole("button", { name: "Set up authenticator" }),
    );
    expect(
      await screen.findByAltText("Authenticator setup QR code"),
    ).toBeTruthy();
    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm setup" }));
    expect(await screen.findByText("one-time-recovery-code")).toBeTruthy();
    expect(screen.queryByText("MANUAL-SETUP-KEY")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "I have saved my codes" }),
    );
    expect(screen.queryByText("one-time-recovery-code")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/account");
  });
  it("shows only approved customer account details and preserves logout", async () => {
    mocks.user = customer;
    const user = userEvent.setup();
    render(<AccountBoundary />);
    expect(
      screen.getByRole("heading", { name: "Personal details" }),
    ).toBeTruthy();
    expect(screen.getByText(customer.email)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Staff access" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /wishlist|orders|addresses/i }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });
});
