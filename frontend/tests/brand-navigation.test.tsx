// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "../src/components/brand/header";
import { StorefrontChrome } from "../src/components/brand/storefront-chrome";

vi.mock("@/components/cart/cart-provider", () => ({
  useCart: () => ({ cart: { item_count: 0 }, loading: false, error: "" }),
}));
const mocks = vi.hoisted(() => ({ pathname: "/products" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

// Reuse the existing locked axe-core dependency; these tests add no download.
const require = createRequire(import.meta.url);
const axe = require(require.resolve("axe-core")) as {
  run: (
    context: HTMLElement,
    options: {
      runOnly: { type: "tag"; values: string[] };
      rules: Record<string, { enabled: boolean }>;
    },
  ) => Promise<{
    violations: {
      id: string;
      impact: string | null;
      nodes: { target: string[]; failureSummary?: string }[];
    }[];
  }>;
};

const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);

beforeEach(() => {
  mocks.pathname = "/products";
  document.documentElement.lang = "en";
  document.title = "IRANTI Africa — navigation fixture";
  // jsdom does not implement native modal focus containment or top-layer behavior.
  // Mock only open/close state; real-browser keyboard and layout QA remain separate.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalShowModal)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      originalShowModal,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose)
    Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function PublicPage() {
  return (
    <StorefrontChrome>
      <main id="main-content">
        <h1>Collection fixture</h1>
        <p>Test page content.</p>
      </main>
    </StorefrontChrome>
  );
}

async function scan() {
  const result = await axe.run(document.body, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    // No rendered pixel/layout engine in jsdom: contrast belongs to browser QA.
    rules: { "color-contrast": { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe("brand navigation behavior", () => {
  it("keeps named storefront destinations and an accessible cart link", () => {
    render(<Header />);
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    const destinations = {
      Shop: "/products",
      Collections: "/#collections",
      "Our story": "/#our-story",
    };
    for (const [name, href] of Object.entries(destinations)) {
      expect(
        within(navigation).getByRole("link", { name }).getAttribute("href"),
      ).toBe(href);
    }
    expect(
      within(navigation)
        .getByRole("link", { name: "Shop" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "Search the collection" })
        .getAttribute("href"),
    ).toBe("/search");
    expect(
      screen.getByRole("link", { name: "Your account" }).getAttribute("href"),
    ).toBe("/account");
    expect(
      screen
        .getByRole("link", { name: "IRANTI Africa home" })
        .getAttribute("href"),
    ).toBe("/");
    expect(
      screen
        .getByRole("link", { name: "Skip to content" })
        .getAttribute("href"),
    ).toBe("#main-content");
    expect(
      screen
        .getByRole("link", { name: "View cart, 0 items" })
        .getAttribute("href"),
    ).toBe("/cart");
  });

  it("opens the named mobile menu with the keyboard, then closes and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(screen.queryByRole("dialog", { name: "Explore IRANTI" })).toBeNull();
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", {
      name: "Explore IRANTI",
    }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(
      within(dialog).getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Close explore iranti" }),
    );
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the menu on a genuine destination link and native Escape cancellation", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    let dialog = screen.getByRole("dialog", {
      name: "Explore IRANTI",
    }) as HTMLDialogElement;
    const shop = within(dialog).getByRole("link", { name: "Shop" });
    expect(shop.getAttribute("href")).toBe("/products");
    // Avoid asking jsdom to perform navigation while retaining the component click handler.
    shop.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    await user.click(shop);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    dialog = screen.getByRole("dialog", {
      name: "Explore IRANTI",
    }) as HTMLDialogElement;
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it.each(["/", "/products", "/products/basket", "/search", "/account"])(
    "includes public navigation and footer on %s without replacing the page landmark",
    (pathname) => {
      mocks.pathname = pathname;
      render(<PublicPage />);
      expect(screen.getByRole("banner")).toBeTruthy();
      expect(screen.getByRole("contentinfo")).toBeTruthy();
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(
        screen.getByRole("heading", { name: "Collection fixture" }),
      ).toBeTruthy();
    },
  );

  it.each([
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/mfa",
    "/mfa/recovery",
    "/admin",
    "/admin/catalog",
  ])(
    "keeps the separate authentication or operational layout on %s",
    (pathname) => {
      mocks.pathname = pathname;
      render(<PublicPage />);
      expect(screen.queryByRole("banner")).toBeNull();
      expect(screen.queryByRole("contentinfo")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Open navigation" }),
      ).toBeNull();
      expect(screen.getByRole("main").textContent).toContain(
        "Test page content.",
      );
    },
  );

  it("finds no detectable WCAG violations in the composed public header and footer", async () => {
    render(<PublicPage />);
    await scan();
  });

  it("finds no detectable WCAG violations in the open mobile navigation", async () => {
    const user = userEvent.setup();
    render(<PublicPage />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await scan();
  });
});
