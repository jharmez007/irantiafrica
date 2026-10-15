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
  orderRequest: vi.fn(),
  continuePayment: vi.fn(),
  push: vi.fn(),
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
vi.mock("@/lib/order-api", () => ({ orderRequest: mocks.orderRequest }));
vi.mock("@/lib/hosted-payment", () => ({
  continueHostedPayment: mocks.continuePayment,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/cart",
  useRouter: () => ({ push: mocks.push }),
}));
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
      available_quantity: 6,
      unit_price_minor: "10000",
      line_subtotal_minor: "20000",
      suggested_quantity: 2,
      state: "AVAILABLE",
    },
  ],
};
const linked: NonNullable<CartData["linked_order"]> = {
  id: "order-one",
  number: "IRA-EXAMPLE",
  ownership: "account",
  status: "PENDING_PAYMENT",
  payment_state: "NOT_STARTED",
  total_minor: "23000",
  currency: "NGN",
  version: 1,
  cart_changed: false,
  reservation_status: "ACTIVE",
  reservation_expires_at: "2030-01-01T00:00:00Z",
  reservation_active: true,
  attempt_status: null,
  release_confirmed: false,
  payment_unresolved: false,
  can_continue: true,
  can_cancel: true,
  can_start_new: false,
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
  mocks.orderRequest.mockReset();
  mocks.continuePayment.mockReset();
  mocks.push.mockReset();
  mocks.auth = { user: null, loading: false };
  localStorage.clear();
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
      name: "You may also like",
    });
    expect(screen.getByRole("link", { name: /Woven mat/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Woven tray/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Unavailable/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Woven basket/ })).toBeNull();
  });
  it("opens a dismissible bag drawer after an accepted addition with bag and checkout actions", async () => {
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
    await userEvent.click(
      screen.getByRole("button", { name: "Increase quantity" }),
    );
    add.focus();
    await userEvent.click(add);
    expect(mocks.request).toHaveBeenCalledWith("POST", "/items", {
      variant_id: "variant-one",
      quantity: 2,
      expected_version: 1,
    });
    const dialog = await screen.findByRole("dialog", {
      name: "My bag (2)",
    });
    expect(dialog.textContent).toContain("Added to your bag");
    expect(dialog.textContent).toContain("Just added");
    expect(dialog.textContent).toContain("Woven basket");
    expect(dialog.textContent).toContain("Finish: Natural");
    expect(
      screen.getByRole("link", { name: "View bag" }).getAttribute("href"),
    ).toBe("/cart");
    expect(
      screen.getByRole("link", { name: "Checkout" }).getAttribute("href"),
    ).toBe("/checkout?from=cart");
    await userEvent.click(
      screen.getByRole("button", { name: "Continue shopping" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "My bag (2)" })).toBeNull(),
    );
    expect(document.activeElement).toBe(add);
  });
  it("shows every line from the accepted cart payload and marks only the newly added line", async () => {
    const second = {
      ...full.items[0],
      id: "line-two",
      variant_id: "variant-two",
      name: "Leather pouch",
      slug: "leather-pouch",
      options: ["Colour: Cognac", "Size: Large"],
      quantity: 1,
      unit_price_minor: "15000",
      line_subtotal_minor: "15000",
    };
    const both: CartData = {
      ...full,
      version: 3,
      item_count: 3,
      subtotal_minor: "35000",
      items: [full.items[0], second],
    };
    mocks.request.mockResolvedValueOnce(full).mockResolvedValueOnce(both);
    render(
      <CartProvider>
        <AddToCart variantId="variant-two" available />
      </CartProvider>,
    );
    const add = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() =>
      expect((add as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.setup().click(add);
    const dialog = await screen.findByRole("dialog", { name: "My bag (3)" });
    expect(dialog.querySelectorAll(".mini-cart-line")).toHaveLength(2);
    expect(dialog.textContent).toContain("Woven basket");
    expect(dialog.textContent).toContain("Leather pouch");
    expect(dialog.textContent).toContain("Colour: Cognac · Size: Large");
    expect(dialog.querySelectorAll(".mini-cart-line--added")).toHaveLength(1);
    expect(
      dialog.querySelector(".mini-cart-line--added")?.textContent,
    ).toContain("Leather pouch");
    expect(dialog.textContent).toContain("₦350.00");
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it("updates quantity and subtotal from the server, then shows the empty state after removal", async () => {
    const increased: CartData = {
      ...full,
      version: 3,
      item_count: 3,
      subtotal_minor: "30000",
      items: [{ ...full.items[0], quantity: 3, line_subtotal_minor: "30000" }],
    };
    mocks.request
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(increased)
      .mockResolvedValueOnce({ ...empty, version: 4 });
    render(
      <CartProvider>
        <AddToCart variantId="variant-one" available />
      </CartProvider>,
    );
    const add = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() =>
      expect((add as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.setup().click(add);
    await screen.findByRole("dialog", { name: "My bag (2)" });
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Increase quantity for woven basket",
      }),
    );
    const updated = await screen.findByRole("dialog", { name: "My bag (3)" });
    expect(updated.querySelector(".mini-cart-subtotal")?.textContent).toContain(
      "₦300.00",
    );
    expect(mocks.request).toHaveBeenCalledWith("PATCH", "/items/line-one", {
      quantity: 3,
      expected_version: 2,
    });
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Remove Woven basket from bag" }),
      );
    expect(await screen.findByText("Your bag is empty")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Explore the collection" }),
    ).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith("DELETE", "/items/line-one", {
      expected_version: 3,
    });
  });
  it("does not open a success drawer when the add request fails", async () => {
    mocks.request
      .mockResolvedValueOnce(empty)
      .mockRejectedValueOnce(new Error("Unable to add"))
      .mockResolvedValueOnce(empty);
    render(
      <CartProvider>
        <AddToCart variantId="variant-one" available />
      </CartProvider>,
    );
    const add = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() =>
      expect((add as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.setup().click(add);
    await screen.findByText(/couldn't confirm that change/i);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps review-required carts in the drawer without offering checkout", async () => {
    mocks.request.mockResolvedValueOnce(empty).mockResolvedValueOnce({
      ...full,
      needs_review: true,
      items: [{ ...full.items[0], state: "QUANTITY_REVIEW" }],
    });
    render(
      <CartProvider>
        <AddToCart variantId="variant-one" available />
      </CartProvider>,
    );
    const add = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() =>
      expect((add as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.setup().click(add);
    await screen.findByRole("dialog", { name: "My bag (2)" });
    expect(screen.queryByRole("link", { name: "Checkout" })).toBeNull();
    expect(screen.getByRole("link", { name: "View bag" })).toBeTruthy();
    expect(
      screen.getByText(/Review the marked items in your bag/),
    ).toBeTruthy();
  });
  it("closes on dialog cancel and restores focus to Add to cart", async () => {
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
    await userEvent.setup().click(add);
    const dialog = await screen.findByRole("dialog", { name: "My bag (2)" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(add);
  });
  it("loads an empty guest cart and keeps checkout unavailable", async () => {
    mocks.request.mockResolvedValue(empty);
    render(<Page />);
    expect(
      screen.getByRole("status", { name: "Loading your cart" }),
    ).toBeTruthy();
    await screen.findByText("Your bag is empty");
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
    expect(screen.getAllByText("₦200.00").length).toBe(3);
    expect(screen.getByText("Delivery")).toBeTruthy();
    expect(screen.getByText("Tax")).toBeTruthy();
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Proceed to checkout" })
        .getAttribute("href"),
    ).toBe("/checkout?from=cart");
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
  it("disables cart increment at the selected line's available stock", async () => {
    mocks.request.mockResolvedValue({
      ...full,
      items: [{ ...full.items[0], available_quantity: 2 }],
    });
    render(<Page />);
    const plus = await screen.findByRole("button", {
      name: /Increase quantity/,
    });
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole("group", { name: "Quantity for Woven basket" })
        .textContent,
    ).toContain("Maximum 2 units");
    await userEvent.setup().click(plus);
    expect(
      mocks.request.mock.calls.filter(([method]) => method === "PATCH"),
    ).toHaveLength(0);
  });
  it("shows a concise low-stock note only when the API marks the variant low", async () => {
    mocks.request.mockResolvedValue({
      ...full,
      items: [{ ...full.items[0], low_stock: true, available_quantity: 2 }],
    });
    render(<Page />);
    expect(await screen.findByText("Only 2 left.")).toBeTruthy();
    expect(screen.queryByText(/reserved quantity/i)).toBeNull();
  });
  it.each([4, 10, 21])(
    "renders a %i-line bag without repeating summary controls per line",
    async (count) => {
      const lines = Array.from({ length: count }, (_, index) => ({
        ...full.items[0],
        id: `line-${index}`,
        variant_id: `variant-${index}`,
        name: `Woven basket ${index + 1}`,
        quantity: 1,
        line_subtotal_minor: "10000",
      }));
      mocks.request.mockResolvedValue({
        ...full,
        item_count: count,
        subtotal_minor: String(count * 10000),
        items: lines,
      });
      render(
        <CartProvider>
          <CartPage />
        </CartProvider>,
      );
      await screen.findByText(`${count} items`);
      expect(
        screen
          .getByRole("list", { name: "Items in your bag" })
          .querySelectorAll(".cart-line"),
      ).toHaveLength(count);
      expect(
        screen.getAllByRole("link", { name: "Proceed to checkout" }),
      ).toHaveLength(1);
    },
  );
  it("changes quantity without an Update action and shows a pending value", async () => {
    await populated();
    let finish!: (value: CartData) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise<CartData>((resolve) => {
          finish = resolve;
        }),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Increase quantity/ }));
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
    expect(screen.getByText("Updating…")).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Quantity for Woven basket" })
        .textContent,
    ).toContain("3");
    finish({
      ...full,
      version: 3,
      item_count: 3,
      subtotal_minor: "30000",
      items: [{ ...full.items[0], quantity: 3, line_subtotal_minor: "30000" }],
    });
    await screen.findByRole("link", { name: "View cart, 3 items" });
  });
  it("restores the authoritative quantity after an automatic update fails", async () => {
    await populated();
    mocks.request
      .mockRejectedValueOnce(
        new CartApiError(
          409,
          "CART_STOCK_CHANGED",
          "Only 2 are available. Reduce the quantity to continue.",
        ),
      )
      .mockResolvedValueOnce({
        ...full,
        items: [{ ...full.items[0], available_quantity: 2 }],
      });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Increase quantity/ }));
    await screen.findByText(/Only 2 are available.*refreshed your cart/);
    expect(
      screen.getByRole("group", { name: "Quantity for Woven basket" })
        .textContent,
    ).toContain("2");
    expect(
      mocks.request.mock.calls.filter(([method]) => method === "PATCH"),
    ).toHaveLength(1);
  });
  it("shows the selected variant thumbnail when the cart response provides one", async () => {
    mocks.request.mockResolvedValue({
      ...full,
      items: [
        {
          ...full.items[0],
          image: {
            id: "variant-image",
            variant_id: "variant-one",
            alt_text: "Natural woven basket",
            position: 0,
            width: 640,
            height: 480,
            sources: [{ url: "/natural.webp", width: 640, height: 480 }],
          },
        },
      ],
    });
    render(<Page />);
    expect(
      (await screen.findByAltText("Natural woven basket")).getAttribute("src"),
    ).toBe("/natural.webp");
  });
  it("removes a named line, updates the badge and moves focus to the heading", async () => {
    await populated();
    mocks.request.mockResolvedValueOnce({ ...empty, version: 3 });
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Remove Woven basket from cart",
      }),
    );
    await screen.findByText("Your bag is empty");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Your bag" }),
      ),
    );
    expect(mocks.request).toHaveBeenLastCalledWith(
      "DELETE",
      "/items/line-one",
      { expected_version: 2 },
    );
  });
  it("requires confirmation before clearing the cart through the API", async () => {
    await populated();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clear cart" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Clear your bag?",
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep my bag" }),
    );
    expect(
      mocks.request.mock.calls.filter(([method]) => method === "DELETE"),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Keep my bag" }));
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));
    mocks.request.mockResolvedValueOnce({ ...empty, version: 3 });
    await user.click(screen.getByRole("button", { name: "Clear cart" }));
    await user.click(screen.getByRole("button", { name: "Clear bag" }));
    await screen.findByText("Your bag is empty");
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
          quantity: 5,
          state: "QUANTITY_REVIEW",
          suggested_quantity: 3,
          available_quantity: 3,
        },
      ],
    };
    mocks.request.mockResolvedValue(data);
    render(<Page />);
    const accept = await screen.findByRole("button", {
      name: "Update to 3 for Woven basket",
    });
    expect(
      screen.getByRole("group", { name: "Quantity for Woven basket" })
        .textContent,
    ).toContain("5");
    expect(screen.getByText(/Only 3 available/)).toBeTruthy();
    expect(screen.getByText(/Your bag was updated after sign-in/)).toBeTruthy();
    mocks.request.mockResolvedValueOnce({
      ...full,
      version: 3,
      item_count: 3,
      items: [{ ...full.items[0], quantity: 3 }],
    });
    await userEvent.setup().click(accept);
    expect(mocks.request).toHaveBeenLastCalledWith("PATCH", "/items/line-one", {
      quantity: 3,
      expected_version: 2,
    });
  });
  it("explains an own-order hold above the bag and resumes the accepted order", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      needs_review: true,
      subtotal_minor: "0",
      linked_order: linked,
      items: [
        {
          ...full.items[0],
          state: "OUT_OF_STOCK",
          available_quantity: 0,
          suggested_quantity: 0,
          held_by_order_quantity: 2,
        },
      ],
    });
    render(<Page />);
    await screen.findByRole("heading", {
      name: "Finish your order.",
    });
    expect(screen.getByText(/Part of your unfinished order/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: /Woven basket.*part of your unfinished order/,
        })
        .getAttribute("href"),
    ).toBe("#cart-line-line-one");
    expect(screen.getByText("Not in subtotal")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Proceed to checkout" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Refresh availability" }),
    ).toBeTruthy();
    let finish!: (value: "redirecting") => void;
    mocks.continuePayment.mockReturnValueOnce(
      new Promise<"redirecting">((resolve) => {
        finish = resolve;
      }),
    );
    const continueButton = screen.getByRole("button", {
      name: "Continue payment",
    });
    await userEvent.setup().click(continueButton);
    await userEvent.setup().click(continueButton);
    expect(mocks.continuePayment).toHaveBeenCalledOnce();
    expect(mocks.continuePayment.mock.calls[0][0]).toBe("order-one");
    expect(mocks.orderRequest).not.toHaveBeenCalled();
    finish("redirecting");
    await waitFor(() =>
      expect((continueButton as HTMLButtonElement).disabled).toBe(false),
    );
  });
  it("shows guest recovery only after the scoped order-and-cart endpoint confirms it", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    localStorage.setItem("iranti-guest-recovery-order", id);
    mocks.request.mockResolvedValue({
      ...full,
      needs_review: true,
      subtotal_minor: "0",
      items: [
        { ...full.items[0], state: "OUT_OF_STOCK", available_quantity: 0 },
      ],
    });
    mocks.orderRequest.mockResolvedValue({
      linked_order: { ...linked, id, ownership: "guest" },
      held_items: { "variant-one": 2 },
    });
    render(<Page />);
    await screen.findByRole("heading", {
      name: "Finish your order.",
    });
    expect(mocks.orderRequest).toHaveBeenCalledWith(
      `/orders/${id}/cart-recovery`,
    );
    expect(
      screen.getByRole("link", { name: "View order" }).getAttribute("href"),
    ).toBe(`/orders/${id}`);
    expect(
      screen.getByRole("link", { name: /part of your unfinished order/ }),
    ).toBeTruthy();
  });
  it("confirms cancellation through the order API, keeps the bag and refreshes availability", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    const held: CartData = {
      ...full,
      needs_review: true,
      subtotal_minor: "0",
      linked_order: linked,
      items: [
        {
          ...full.items[0],
          state: "OUT_OF_STOCK",
          available_quantity: 0,
          held_by_order_quantity: 2,
        },
      ],
    };
    const released: CartData = {
      ...full,
      linked_order: {
        ...linked,
        status: "CANCELLED",
        reservation_status: "RELEASED",
        reservation_active: false,
        release_confirmed: true,
        can_continue: false,
        can_cancel: false,
        can_start_new: true,
      },
    };
    mocks.request.mockResolvedValueOnce(held).mockResolvedValueOnce(released);
    mocks.orderRequest
      .mockResolvedValueOnce({ id: "order-one", version: 1, can_cancel: true })
      .mockResolvedValueOnce({ id: "order-one", status: "CANCELLED" });
    render(<Page />);
    await screen.findByRole("button", { name: "Cancel pending order" });
    const trigger = screen.getByRole("button", {
      name: "Cancel pending order",
    });
    await userEvent.setup().click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Cancel pending order?",
    });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));
    expect(document.activeElement).toBe(trigger);
    expect(mocks.orderRequest).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cancel pending order" }));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cancel order" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Finish your order." }),
      ).toBeNull(),
    );
    expect(mocks.orderRequest).toHaveBeenCalledWith(
      "/orders/order-one/cancel",
      "POST",
      { expected_version: 1, reason: "Customer cancelled before payment" },
    );
    expect(
      mocks.orderRequest.mock.calls.filter(([path]) =>
        path.endsWith("/cancel"),
      ),
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Proceed to checkout" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("link", { name: "Proceed to checkout" }),
      ),
    );
    expect(
      screen.queryByRole("link", { name: "Start a new checkout" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("list", { name: "Items in your bag" })
        .querySelectorAll(".cart-line"),
    ).toHaveLength(1);
  });
  it("checks an unresolved attempt without offering another payment or cancellation", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      linked_order: {
        ...linked,
        payment_state: "PENDING",
        attempt_status: "UNKNOWN",
        payment_unresolved: true,
        can_continue: false,
        can_cancel: false,
      },
    });
    mocks.orderRequest.mockResolvedValue({
      order: { payment: { state: "PENDING" } },
      attempts: [{ id: "attempt-one", status: "UNKNOWN" }],
    });
    render(<Page />);
    await waitFor(() =>
      expect(mocks.orderRequest).toHaveBeenCalledWith(
        "/orders/order-one/payment-attempts/attempt-one/verify",
        "POST",
        {},
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Continue payment" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cancel pending order" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Get help" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Check payment status" }),
    ).toBeNull();
    expect(mocks.continuePayment).not.toHaveBeenCalled();
  });
  it("keeps an expired uncertain order safe without exposing stock or payment internals", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      linked_order: {
        ...linked,
        reservation_status: "EXPIRED",
        reservation_active: false,
        release_confirmed: true,
        payment_state: "PENDING",
        attempt_status: "UNKNOWN",
        payment_unresolved: true,
        can_continue: false,
        can_cancel: false,
        can_start_new: false,
      },
    });
    mocks.orderRequest.mockResolvedValue({
      order: { payment: { state: "PENDING" } },
      attempts: [{ id: "attempt-one", status: "UNKNOWN" }],
    });
    render(<Page />);
    await screen.findByRole("heading", {
      name: "We’re confirming your earlier payment.",
    });
    expect(screen.getByText(/Your bag is saved/)).toBeTruthy();
    expect(
      screen.queryByText(/stock reservation|Paystack|UNKNOWN|expired/i),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Start a new checkout" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue payment" }),
    ).toBeNull();
  });
  it("keeps provider errors out of the bag and offers a safe retry", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      linked_order: {
        ...linked,
        payment_state: "PENDING",
        attempt_status: "UNKNOWN",
        payment_unresolved: true,
        can_continue: false,
        can_cancel: false,
      },
    });
    mocks.orderRequest.mockRejectedValueOnce(
      new Error("provider response 502"),
    );
    render(<Page />);
    await screen.findByRole("button", { name: "Try again" });
    expect(
      screen.getAllByText(
        "We couldn’t update your order right now. Please try again.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/provider response 502/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Proceed to checkout" }),
    ).toBeNull();
  });
  it("restores the ordinary checkout action after server-confirmed payment resolution", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    const unresolved: CartData = {
      ...full,
      linked_order: {
        ...linked,
        reservation_status: "EXPIRED",
        reservation_active: false,
        release_confirmed: true,
        payment_state: "PENDING",
        attempt_status: "UNKNOWN",
        payment_unresolved: true,
        can_continue: false,
        can_cancel: false,
        can_start_new: false,
      },
    };
    const ready: CartData = {
      ...full,
      linked_order: {
        ...unresolved.linked_order!,
        payment_state: "FAILED",
        attempt_status: "FAILED",
        payment_unresolved: false,
        can_start_new: true,
      },
    };
    mocks.request
      .mockResolvedValueOnce(unresolved)
      .mockResolvedValueOnce(ready);
    mocks.orderRequest
      .mockResolvedValueOnce({
        order: { payment: { state: "PENDING" } },
        attempts: [{ id: "attempt-one", status: "UNKNOWN" }],
      })
      .mockResolvedValueOnce({
        order: { payment: { state: "FAILED" } },
        attempts: [{ id: "attempt-one", status: "FAILED" }],
      });
    render(<Page />);
    expect(
      await screen.findByRole("link", { name: "Proceed to checkout" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: /earlier checkout|expired/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Check payment status" }),
    ).toBeNull();
    expect(mocks.orderRequest).toHaveBeenCalledWith(
      "/orders/order-one/payment-attempts/attempt-one/verify",
      "POST",
      {},
    );
    expect(mocks.continuePayment).not.toHaveBeenCalled();
  });
  it("keeps an edited bag distinct from the original resumable order", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      linked_order: { ...linked, cart_changed: true },
    });
    render(<Page />);
    await screen.findByText(/Continuing opens the earlier order/);
    expect(
      screen.queryByRole("link", { name: "Proceed to checkout" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue payment" }),
    ).toBeTruthy();
  });
  it("shows confirmed release and permits a new checkout after expiry", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      linked_order: {
        ...linked,
        reservation_status: "EXPIRED",
        reservation_active: false,
        release_confirmed: true,
        can_continue: false,
        can_start_new: true,
      },
    });
    render(<Page />);
    await screen.findByRole("link", { name: "Proceed to checkout" });
    expect(screen.queryByRole("heading", { name: /expired/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Proceed to checkout" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Start a new checkout" }),
    ).toBeNull();
  });
  it("shows paid confirmation without clearing the retained bag", async () => {
    mocks.auth.user = {
      id: "customer-one",
      authentication_state: "authenticated",
    };
    mocks.request.mockResolvedValue({
      ...full,
      linked_order: {
        ...linked,
        status: "PAID",
        payment_state: "SUCCESSFUL",
        reservation_status: "COMMITTED",
        reservation_active: false,
        can_continue: false,
        can_cancel: false,
      },
    });
    render(<Page />);
    await screen.findByRole("heading", { name: "Your payment is confirmed." });
    expect(screen.getByRole("link", { name: "View order" })).toBeTruthy();
    expect(
      screen
        .getByRole("list", { name: "Items in your bag" })
        .querySelectorAll(".cart-line"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: "Proceed to checkout" }),
    ).toBeNull();
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
      if (state === "OUT_OF_STOCK")
        expect(screen.getByText("Out of stock.")).toBeTruthy();
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
    await screen.findByText(/check your items before trying again/);
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
    expect(screen.getAllByText("₦300.00").length).toBe(3);
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
    await screen.findByText("Your bag is empty");
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
    await screen.findByText("Your bag is empty");
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
    await screen.findByText("Your bag is empty");
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
