// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../src/components/auth-provider";
import { ToastProvider } from "../src/components/toast-provider";
import { reportSessionFailure } from "../src/lib/session-events";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/admin/products",
}));
const identity = {
  id: "staff",
  name: "Staff",
  email: "staff@example.test",
  email_verified: true,
  roles: ["owner"],
  permissions: [],
  authentication_state: "authenticated",
};
function Probe() {
  const { user, logout } = useAuth();
  return (
    <>
      <p>{user ? "Signed in" : "Signed out"}</p>
      <button onClick={() => void logout()}>Log out</button>
    </>
  );
}
function mount() {
  render(
    <ToastProvider>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </ToastProvider>,
  );
}
beforeEach(() => {
  navigation.replace.mockReset();
  document.cookie = "XSRF-TOKEN=proof";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("logs out once, clears identity only after the server confirms, and announces success", async () => {
  let complete!: (response: Response) => void;
  const fetch = vi.fn((input: string) => {
    if (input === "/auth/me") throw new Error("Unexpected path");
    if (input === "/api/v1/auth/me")
      return Promise.resolve(Response.json({ data: identity }));
    if (input === "/sanctum/csrf-cookie")
      return Promise.resolve(new Response(null, { status: 204 }));
    return new Promise<Response>((resolve) => {
      complete = resolve;
    });
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  await screen.findByText("Signed in");
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  expect(
    fetch.mock.calls.filter(([path]) => path === "/api/v1/auth/logout"),
  ).toHaveLength(1);
  expect(screen.getByText("Signed in")).toBeTruthy();
  complete(new Response(null, { status: 204 }));
  await screen.findByText("Signed out");
  expect(screen.getByRole("status").textContent).toContain(
    "Signed out successfully",
  );
});

it("treats an already-expired logout as signed out after an identity probe", async () => {
  const fetch = vi.fn((input: string) =>
    Promise.resolve(
      input === "/api/v1/auth/me"
        ? fetch.mock.calls.filter(([path]) => path === "/api/v1/auth/me")
            .length === 1
          ? Response.json({ data: identity })
          : Response.json({ error: {} }, { status: 401 })
        : input === "/api/v1/auth/logout"
          ? Response.json({ error: {} }, { status: 401 })
          : new Response(null, { status: 204 }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
  await screen.findByText("Signed in");
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByText("Signed out");
  expect(screen.getByRole("status").textContent).toContain(
    "session has expired",
  );
});

it("deduplicates concurrent 401 failures and redirects only after identity is confirmed lost", async () => {
  const fetch = vi.fn((input: string) =>
    Promise.resolve(
      input === "/api/v1/auth/me"
        ? fetch.mock.calls.filter(([path]) => path === "/api/v1/auth/me")
            .length === 1
          ? Response.json({ data: identity })
          : Response.json({ error: {} }, { status: 401 })
        : new Response(null, { status: 204 }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
  await screen.findByText("Signed in");
  reportSessionFailure(401, "/admin/products");
  reportSessionFailure(401, "/admin/inventory");
  await screen.findByText("Signed out");
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
  expect(navigation.replace).toHaveBeenCalledWith("/login");
  expect(
    screen.getAllByText("Your session has expired. Please sign in again."),
  ).toHaveLength(1);
});

it("refreshes CSRF on 419 without replaying the mutation", async () => {
  const fetch = vi.fn((input: string) =>
    Promise.resolve(
      input === "/api/v1/auth/me"
        ? Response.json({ data: identity })
        : new Response(null, { status: 204 }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
  await screen.findByText("Signed in");
  reportSessionFailure(419, "/admin/products");
  reportSessionFailure(419, "/admin/inventory");
  await waitFor(() =>
    expect(
      fetch.mock.calls.filter(([path]) => path === "/sanctum/csrf-cookie"),
    ).toHaveLength(1),
  );
  expect(
    fetch.mock.calls.filter(([path]) => path === "/api/v1/admin/products"),
  ).toHaveLength(0);
  expect(screen.getByRole("status").textContent).toContain(
    "security check expired",
  );
});

it("does not expose a protected staff page after a revoked session is reloaded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ error: {} }, { status: 401 }))),
  );
  mount();
  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/login"),
  );
  expect(screen.getByText("Signed out")).toBeTruthy();
  expect(
    screen.getAllByText("Your session has expired. Please sign in again."),
  ).toHaveLength(1);
});
