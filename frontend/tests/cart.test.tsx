// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartProvider } from "../src/components/cart/cart-provider";
import { CartPage } from "../src/components/cart/cart-page";
import { AddToCart } from "../src/components/cart/add-to-cart";
import { CartRecommendations } from "../src/components/cart/cart-recommendations";
import { Header } from "../src/components/brand/header";
import { CartApiError, type CartData } from "../src/lib/cart-api";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  auth: {
    user: null as null | { id: string; authentication_state: string },
    loading: false,
  },
}));
vi.mock("@/lib/cart-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/cart-api")>()),
  cartRequest: mocks.request,
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("next/navigation", () => ({ usePathname: () => "/cart" }));
const empty: CartData = {
  version: 1,
  currency: "NGN",
  items: [],
  item_count: 0,
  subtotal_minor: "0",
  needs_review: false,
  amount_limit: false,
  limits: { quantity: 99, lines: 100 },
  merge: null,
};
const full: CartData = {
  ...empty,
  version: 2,
  item_count: 2,
  subtotal_minor: "20000",
  items: [
    {
      id: "line-one",
      variant_id: "variant-one",
      name: "Woven basket",
      slug: "woven-basket",
      options: ["Finish: Natural"],
      image: null,
      quantity: 2,
      unit_price_minor: "10000",
      line_subtotal_minor: "20000",
      suggested_quantity: 2,
      state: "AVAILABLE",
    },
  ],
};
function Page() {
  return (
    <CartProvider>
      <Header />
      <CartPage />
    </CartProvider>
  );
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.auth = { user: null, loading: false };
  document.documentElement.lang = "en";
  document.title = "Cart test";
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function populated() {
  mocks.request.mockResolvedValue(full);
  render(<Page />);
  await screen.findByRole("link", { name: "Woven basket" });
}
describe("persistent cart UI", () => {
  it("shows up to four purchasable complementary products below the cart", async () => {
    const source = {
      slug: "woven-basket",
      name: "Woven basket",
      categories: [{ slug: "home", name: "Home" }],
      available: true,
      status: "published",
      price_min_minor: "10000",
      price_max_minor: "10000",
      media: [],
      currency: "NGN",
    };
    const candidates = [
      source,
      { ...source, slug: "woven-mat", name: "Woven mat" },
      { ...source, slug: "woven-tray", name: "Woven tray" },
      { ...source, slug: "unavailable", name: "Unavailable", available: false },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.endsWith("/products/woven-basket")
            ? { data: source }
            : { data: candidates },
      })),
    );
    render(<CartRecommendations lines={full.items} />);
    await screen.findByRole("heading", {
      name: "Pairs well with your selection",
    });
    expect(screen.getByRole("link", { name: /Woven mat/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Woven tray/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Unavailable/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Woven basket/ })).toBeNull();
  });
  it("opens a dismissible mini-cart after an accepted addition with bag and checkout actions", async () => {
    mocks.request.mockResolvedValueOnce(empty).mockResolvedValueOnce(full);
    render(
      <CartProvider>
        <AddToCart variantId="variant-one" available />
      </CartProvider>,
    );
    const add = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() =>
      expect((add as HTMLButtonElement).disabled).toBe(false),
    );
    add.focus();
    await userEvent.click(add);
    const dialog = await screen.findByRole("dialog", {
      name: "Added to your bag",
    });
    expect(dialog.textContent).toContain("Woven basket");
    expect(dialog.textContent).toContain("Finish: Natural");
    expect(
      screen.getByRole("link", { name: "View bag" }).getAttribute("href"),
    ).toBe("/cart");
    expect(
      screen.getByRole("link", { name: "Checkout" }).getAttribute("href"),
    ).toBe("/checkout");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue shopping" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Added to your bag" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(add);
  });
  it("loads an empty guest cart and keeps checkout unavailable", async () => {
    mocks.request.mockResolvedValue(empty);
    render(<Page />);
    expect(
      screen.getByRole("status", { name: "Loading your cart" }),
    ).toBeTruthy();
    await screen.findByText("Your cart is empty");
    expect(
      screen
        .getByRole("link", { name: "View cart, 0 items" })
        .getAttribute("href"),
    ).toBe("/cart");
    expect(
      screen.queryByRole("button", { name: "Proceed to checkout" }),
    ).toBeNull();
  });
  it("uses server subtotals, displays options and a checkout link for valid items", async () => {
    await populated();
    expect(screen.getByText("Finish: Natural")).toBeTruthy();
    expect(screen.getAllByText("₦200.00").length).toBe(2);
    expect(
      screen
        .getByRole("link", { name: "Proceed to checkout" })
        .getAttribute("href"),
    ).toBe("/checkout");
    expect(
      screen.getByRole("link", { name: "View cart, 2 items" }),
    ).toBeTruthy();
  });
  it("updates quantities and badge from the returned backend state while preserving focus", async () => {
    await populated();
    const user = userEvent.setup();
    const increased = {
      ...full,
      version: 3,
      item_count: 3,
      subtotal_minor: "30000",
      items: [{ ...full.items[0], quantity: 3, line_subtotal_minor: "30000" }],
    };
    mocks.request.mockResolvedValueOnce(increased);
    const plus = screen.getByRole("button", { name: /Increase quantity/ });
    await user.click(plus);
    await screen.findByRole("link", { name: "View cart, 3 items" });
    expect(mocks.request).toHaveBeenLastCalledWith("PATCH", "/items/line-one", {
      quantity: 3,
      expected_version: 2,
    });
    expect(document.activeElement).toBe(plus);
    mocks.request.mockResolvedValueOnce({ ...full, version: 4 });
    await user.click(screen.getByRole("button", { name: /Decrease quantity/ }));
    await screen.findByRole("link", { name: "View cart, 2 items" });
    expect(mocks.request).toHaveBeenLastCalledWith("PATCH", "/items/line-one", {
      quantity: 2,
      expected_version: 3,
    });
  });
  it("validates quantity locally and associates errors with the input", async () => {
    await populated();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/Quantity for Woven basket/);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByText("Enter a whole number from 1 to 99.")).toBeTruthy();
    expect(input.getAttribute("aria-describedby")).toContain(
      "quantity-error-line-one",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("removes a named line, updates the badge and moves focus to the heading", async () => {
    await populated();
    mocks.request.mockResolvedValueOnce({ ...empty, version: 3 });
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Remove Woven basket — Finish: Natural",
      }),
    );
    await screen.findByText("Your cart is empty");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Your cart" }),
    );
    expect(mocks.request).toHaveBeenLastCalledWith(
      "DELETE",
      "/items/line-one",
      { expected_version: 2 },
    );
  });
  it("clears the cart only through the API", async () => {
    await populated();
    mocks.request.mockResolvedValueOnce({ ...empty, version: 3 });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Clear cart" }));
    await screen.findByText("Your cart is empty");
    expect(mocks.request).toHaveBeenLastCalledWith("DELETE", "", {
      expected_version: 2,
    });
  });
  it("keeps unavailable lines visible and presents an explicit suggested reduction", async () => {
    const data: CartData = {
      ...full,
      needs_review: true,
      subtotal_minor: "0",
      merge: {
        status: "MERGED",
        message:
          "Your guest items have been merged. Review current prices and availability.",
      },
      items: [
        {
          ...full.items[0],
          quantity: 4,
          state: "QUANTITY_REVIEW",
          suggested_quantity: 1,
        },
      ],
    };
    mocks.request.mockResolvedValue(data);
    render(<Page />);
    const accept = await screen.findByRole("button", {
      name: "Accept quantity 1 for Woven basket",
    });
    expect(
      (screen.getByLabelText(/Quantity for Woven basket/) as HTMLInputElement)
        .value,
    ).toBe("4");
    expect(screen.getByText(/Your guest items have been merged/)).toBeTruthy();
    mocks.request.mockResolvedValueOnce({
      ...full,
      version: 3,
      item_count: 1,
      items: [{ ...full.items[0], quantity: 1 }],
    });
    await userEvent.setup().click(accept);
    expect(mocks.request).toHaveBeenLastCalledWith("PATCH", "/items/line-one", {
      quantity: 1,
      expected_version: 2,
    });
  });
  it.each(["OUT_OF_STOCK", "UNAVAILABLE"] as const)(
    "retains %s lines with a usable remove action",
    async (state) => {
      mocks.request.mockResolvedValue({
        ...full,
        needs_review: true,
        items: [{ ...full.items[0], state }],
      });
      render(<Page />);
      await screen.findByRole("button", { name: /Remove Woven basket/ });
      expect(
        (
          screen.getByRole("button", {
            name: /Increase quantity/,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    },
  );
  it("refreshes server state after conflict without automatically replaying an addition", async () => {
    mocks.request
      .mockResolvedValueOnce(empty)
      .mockRejectedValueOnce(
        new CartApiError(409, "CART_VERSION_CONFLICT", "Your cart changed."),
      )
      .mockResolvedValueOnce(full);
    render(
      <CartProvider>
        <Header />
        <AddToCart variantId="variant-one" available />
      </CartProvider>,
    );
    const button = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.setup().click(button);
    await screen.findByText(/previous request may already have completed/);
    expect(
      mocks.request.mock.calls.filter((call) => call[0] === "POST"),
    ).toHaveLength(1);
    expect(mocks.request).toHaveBeenCalledWith("POST", "/items", {
      variant_id: "variant-one",
      quantity: 1,
      expected_version: 1,
    });
  });
  it("announces changed prices on revalidation instead of using stored browser totals", async () => {
    await populated();
    mocks.request.mockResolvedValueOnce({
      ...full,
      items: [
        {
          ...full.items[0],
          unit_price_minor: "15000",
          line_subtotal_minor: "30000",
        },
      ],
      subtotal_minor: "30000",
    });
    fireEvent.focus(window);
    await screen.findByText("A price changed; review the current prices.");
    expect(screen.getAllByText("₦300.00").length).toBe(2);
  });
  it("shows API failures with a retry and recovers without fabricated cart data", async () => {
    mocks.request
      .mockRejectedValueOnce(new Error("Cart service unavailable"))
      .mockResolvedValueOnce(empty);
    render(<Page />);
    await screen.findByText("Cart service unavailable");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Retry cart" }));
    await screen.findByText("Your cart is empty");
  });
  it("reloads on identity changes and never renders the previous user's cart", async () => {
    mocks.auth.user = {
      id: "customer-a",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValueOnce(full);
    const page = render(<Page />);
    await screen.findByRole("link", { name: "Woven basket" });
    mocks.auth.user = null;
    mocks.request.mockResolvedValueOnce(empty);
    page.rerender(<Page />);
    expect(screen.queryByRole("link", { name: "Woven basket" })).toBeNull();
    await screen.findByText("Your cart is empty");
    mocks.auth.user = {
      id: "customer-a",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValueOnce(full);
    page.rerender(<Page />);
    await screen.findByRole("link", { name: "Woven basket" });
  });
  it("accepts a fresh guest cart after expiry even when its version is lower", async () => {
    await populated();
    mocks.request.mockResolvedValueOnce(empty);
    fireEvent.focus(window);
    await screen.findByText("Your cart is empty");
  });
  it("has no detectable axe violations in the populated cart", async () => {
    await populated();
    const require = createRequire(import.meta.url);
    const axe = require(require.resolve("axe-core"));
    const result = await axe.run(document.body, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});
