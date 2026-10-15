// @vitest-environment jsdom
import { createRequire } from "node:module";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutPage } from "../src/components/checkout/checkout-page";
import { CheckoutError, type Checkout } from "../src/lib/checkout-api";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  auth: { user: null as null | { id: string }, loading: false },
  cart: { version: 2, items: [{}], needs_review: false },
  refresh: vi.fn(),
  push: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mock.push }),
}));
vi.mock("@/lib/payment-destination", () => ({
  navigateToPaystack: mock.redirect,
}));
vi.mock("@/lib/checkout-api", async (original) => ({
  ...(await original<typeof import("../src/lib/checkout-api")>()),
  checkoutRequest: mock.request,
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mock.auth }));
vi.mock("@/components/cart/cart-provider", () => ({
  useCart: () => ({ cart: mock.cart, refresh: mock.refresh }),
}));
const address = {
  recipient_name: "Test recipient",
  phone: "+2348012345678",
  line1: "1 Test Road",
  line2: "",
  city: "Lagos",
  state_code: "LAGOS",
  locality_code: null,
  postal_code: "",
  country_code: "NG" as const,
};
const draft: Checkout = {
  id: "checkout-one",
  ownership: "guest",
  status: "DRAFT",
  version: 1,
  currency: "NGN",
  expires_at: "2026-09-23T20:00:00Z",
  fingerprint: null,
  shipping_method_code: null,
  subtotal_minor: "1005",
  tax_minor: null,
  delivery_minor: null,
  total_minor: null,
  contact: null,
  calculation: null,
  lines: [
    {
      id: "line",
      quantity: 3,
      unit_price_minor: "335",
      line_subtotal_minor: "1005",
      snapshot: {
        name: "Woven basket",
        options: ["Natural"],
        image: null,
      },
      tax: null,
    },
  ],
};
const quote: Checkout = {
  ...draft,
  status: "QUOTED",
  version: 3,
  fingerprint: "abc",
  shipping_method_code: "LAGOS",
  contact: { email: "test@example.test", address },
  tax_minor: "152",
  delivery_minor: "505",
  total_minor: "1662",
  calculation: {
    development_only: true,
    product_tax_minor: "101",
    delivery_tax_minor: "51",
    delivery_taxable: true,
    delivery: { code: "LAGOS", service_label: "Sample delivery" },
  },
};
const places = { states: { LAGOS: "Lagos", FCT: "FCT" }, areas: [] };
function setup(current: Checkout | null = draft) {
  mock.request.mockImplementation(async (path: string, method = "GET") => {
    if (path === "/checkout/current") return current;
    if (path === "/checkout/destinations") return places;
    if (path.startsWith("/checkout/shipping-methods?"))
      return [
        {
          code: "LAGOS",
          name: "Sample delivery",
          description: null,
          estimate: null,
          amount_minor: "505",
        },
      ];
    if (path === "/checkout" && method === "POST") return draft;
    if (path === "/addresses" && method === "GET")
      return [{ id: "address-one", ...address }];
    throw new Error("Unexpected request " + path);
  });
}
beforeEach(() => {
  window.history.replaceState({}, "", "/checkout");
  window.sessionStorage.clear();
  mock.request.mockReset();
  mock.push.mockReset();
  mock.redirect.mockReset();
  mock.auth = { user: null, loading: false };
  mock.cart = { version: 2, items: [{}], needs_review: false };
  document.documentElement.lang = "en";
  document.title = "Checkout test";
  setup();
});
afterEach(cleanup);
describe("checkout flow", () => {
  it("automatically starts a guest checkout with a retry key and server cart version", async () => {
    setup(null);
    render(<CheckoutPage />);
    expect(
      screen.getByRole("status", { name: "Loading checkout" }),
    ).toBeTruthy();
    await screen.findByRole("heading", { name: "Contact" });
    expect(screen.queryByText("Begin checkout")).toBeNull();
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(1);
  });
  it("resumes an existing guest or account checkout without creating another", async () => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByRole("button", {
      name: "Continue to payment",
    });
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(0);
  });
  it.each(["REVIEW_REQUIRED", "EXPIRED", "CANCELLED"] as const)(
    "starts a new draft from the cart when the old checkout is %s",
    async (status) => {
      window.history.replaceState({}, "", "/checkout?from=cart");
      window.sessionStorage.setItem(
        "iranti-checkout-begin",
        JSON.stringify({
          scope: "guest",
          body: JSON.stringify({ expected_version: 2 }),
          key: "old-checkout-key",
        }),
      );
      setup({ ...quote, status });
      render(<CheckoutPage />);
      await screen.findByLabelText("Email");
      expect(
        screen.queryByRole("heading", {
          name: "Your cart is ready when you are",
        }),
      ).toBeNull();
      expect(mock.request).toHaveBeenCalledWith(
        "/checkout",
        "POST",
        { expected_version: 2 },
        expect.any(String),
      );
      const begin = mock.request.mock.calls.find(
        (call) => call[0] === "/checkout",
      );
      expect(begin?.[3]).not.toBe("old-checkout-key");
    },
  );
  it("resumes an active draft when entered from the cart", async () => {
    window.history.replaceState({}, "", "/checkout?from=cart");
    setup(draft);
    render(<CheckoutPage />);
    await screen.findByLabelText("Email");
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(0);
  });
  it("does not create duplicate sessions during Strict Mode initialization", async () => {
    setup(null);
    render(
      <StrictMode>
        <CheckoutPage />
      </StrictMode>,
    );
    await screen.findByLabelText("Email");
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/checkout"),
    ).toHaveLength(1);
  });
  it("starts an account-owned checkout with the same safe cart version flow", async () => {
    mock.auth.user = { id: "customer" };
    setup(null);
    mock.request.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/checkout/current") return null;
      if (path === "/checkout/destinations") return places;
      if (path === "/addresses" && method === "GET") return [];
      if (path === "/checkout" && method === "POST")
        return { ...draft, ownership: "account" };
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByLabelText("Email");
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
  });
  it("keeps cart contents and reuses the initiation key when retrying a failed start", async () => {
    setup(null);
    let attempts = 0;
    mock.request.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/checkout/current") return null;
      if (path === "/checkout/destinations") return places;
      if (path === "/checkout" && method === "POST") {
        attempts++;
        if (attempts === 1) throw new Error("Network unavailable");
        return draft;
      }
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByRole("alert");
    expect(screen.getByText("Network unavailable")).toBeTruthy();
    expect(mock.cart.items).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Retry checkout" }),
    );
    await screen.findByLabelText("Email");
    const calls = mock.request.mock.calls.filter(
      (call) => call[0] === "/checkout",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][3]).toBe(calls[1][3]);
  });
  it("shows snapshot line details in the order summary", async () => {
    setup({
      ...draft,
      lines: [
        {
          ...draft.lines[0],
          snapshot: {
            ...draft.lines[0].snapshot,
            image: {
              id: "image-one",
              variant_id: null,
              alt_text: "Woven basket in warm light",
              position: 0,
              width: 640,
              height: 640,
              sources: [{ url: "/basket.webp", width: 640, height: 640 }],
            },
          },
        },
      ],
    });
    render(<CheckoutPage />);
    await screen.findByRole("heading", { name: "Order summary" });
    expect(screen.getByAltText("Woven basket in warm light")).toBeTruthy();
    expect(screen.getByText("Woven basket")).toBeTruthy();
    expect(screen.getByText("Natural")).toBeTruthy();
    expect(screen.getByText(/Qty 3 ·/)).toBeTruthy();
    expect(screen.getByText(/each/)).toBeTruthy();
    expect(screen.getAllByText("₦10.05")).toHaveLength(3);
  });
  it.each([1, 4, 8, 58])(
    "shows all %i snapshot lines without another API call",
    async (count) => {
      setup({
        ...draft,
        lines: Array.from({ length: count }, (_, index) => ({
          ...draft.lines[0],
          id: `line-${index}`,
          quantity: 1,
          snapshot: { ...draft.lines[0].snapshot, name: `Item ${index + 1}` },
        })),
      });
      render(<CheckoutPage />);
      const list = await screen.findByRole("list", {
        name: "Items in your order",
      });
      expect(list.querySelectorAll("li")).toHaveLength(count);
      expect(list.classList.contains("checkout-lines--scrollable")).toBe(
        count > 4,
      );
      expect(mock.request).toHaveBeenCalledTimes(2);
    },
  );
  it("keeps a 22-line order in a scroll region with totals outside", async () => {
    setup({
      ...quote,
      lines: Array.from({ length: 22 }, (_, index) => ({
        ...draft.lines[0],
        id: `line-${index}`,
        quantity: 1,
        snapshot: { ...draft.lines[0].snapshot, name: `Item ${index + 1}` },
      })),
    });
    render(<CheckoutPage />);
    const summary = await screen.findByRole("complementary", {
      name: "Order summary",
    });
    expect(screen.getByText("22 items")).toBeTruthy();
    expect(summary.querySelectorAll(".checkout-lines li")).toHaveLength(22);
    expect(
      summary
        .querySelector(".checkout-lines")
        ?.contains(screen.getByText("Subtotal")),
    ).toBe(false);
    expect(summary.querySelector(".checkout-lines--scrollable")).toBeTruthy();
    expect(screen.getByText("Scroll for more items")).toBeTruthy();
    expect(screen.getByText("Item 22")).toBeTruthy();
    expect(summary.querySelector(".checkout-totals")).toBeTruthy();
  });
  it("offers an accessible compact mobile disclosure with the current total", async () => {
    setup(quote);
    render(<CheckoutPage />);
    const toggle = await screen.findByRole("button", {
      name: /Order summary · 3 items/,
    });
    expect(
      toggle.compareDocumentPosition(
        screen.getByRole("heading", { name: "Contact" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(toggle.textContent).toContain("₦16.62"));
    expect(toggle.getAttribute("aria-controls")).toBe(
      "checkout-summary-content",
    );
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      document
        .getElementById("checkout-summary-content")
        ?.getAttribute("data-mobile-open"),
    ).toBe("true");
  });
  it("shows the configured shipping method and Paystack after a server quote", async () => {
    setup(quote);
    render(<CheckoutPage />);
    const method = await screen.findByRole("radio", {
      name: /Sample delivery/,
    });
    expect((method as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Paystack")).toBeTruthy();
    expect(screen.getAllByText("₦5.05")).toHaveLength(2);
    expect(screen.getByText("₦1.52")).toBeTruthy();
    expect(screen.getAllByText("₦16.62").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Express delivery/)).toBeNull();
  });
  it("restores an unsaved address draft after a page refresh", async () => {
    const first = render(<CheckoutPage />);
    const email = await screen.findByLabelText("Email");
    fireEvent.change(email, { target: { value: "buyer@example.test" } });
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "12 Heritage Street" },
    });
    first.unmount();
    render(<CheckoutPage />);
    expect(
      ((await screen.findByLabelText("Email")) as HTMLInputElement).value,
    ).toBe("buyer@example.test");
    expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe(
      "12 Heritage Street",
    );
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/checkout" && call[1] === "POST",
      ),
    ).toHaveLength(0);
  });
  it("loads shipping on State selection and quotes automatically when the address is complete", async () => {
    setup();
    mock.request.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/checkout/current") return draft;
      if (path === "/checkout/destinations") return places;
      if (path.startsWith("/checkout/shipping-methods?"))
        return [
          {
            code: "LAGOS",
            name: "Sample delivery",
            description: null,
            estimate: null,
            amount_minor: "505",
          },
        ];
      if (path.endsWith("/address") && method === "PATCH")
        return {
          ...draft,
          version: 2,
          contact: { email: "test@example.test", address },
        };
      if (path.endsWith("/shipping-method") && method === "POST") return quote;
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByLabelText("Email");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.test" },
    });
    for (const [label, value] of [
      ["Full name", "Test recipient"],
      ["Phone", "08012345678"],
      ["Address", "1 Test Road"],
      ["City", "Lagos"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await userEvent.selectOptions(screen.getByLabelText("State"), "LAGOS");
    expect(screen.queryByRole("button", { name: "Review order" })).toBeNull();
    await screen.findByRole("radio", { name: /Sample delivery/ });
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some((call) =>
          call[0].endsWith("/shipping-method"),
        ),
      ).toBe(true),
    );
    expect(
      mock.request.mock.calls.some(
        (call) =>
          call[0] === "/checkout/checkout-one/address" &&
          call[1] === "PATCH" &&
          call[2]?.expected_version === 1,
      ),
    ).toBe(true);
    expect(
      mock.request.mock.calls.some(
        (call) =>
          call[0] === "/checkout/checkout-one/shipping-method" &&
          call[1] === "POST" &&
          call[2]?.code === "LAGOS",
      ),
    ).toBe(true);
    expect(
      await screen.findByRole("button", { name: "Continue to payment" }),
    ).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "test@example.test",
    );
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe(
      "+2348012345678",
    );
    expect(
      window.sessionStorage.getItem(
        "iranti-checkout-address-guest-checkout-one",
      ),
    ).toBeNull();
  });
  it("shows no-delivery state with payment visible but progression disabled", async () => {
    setup();
    mock.request.mockImplementation(async (path: string) => {
      if (path === "/checkout/current") return draft;
      if (path === "/checkout/destinations") return places;
      if (path.startsWith("/checkout/shipping-methods?")) return [];
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByLabelText("State");
    await userEvent.selectOptions(screen.getByLabelText("State"), "FCT");
    expect(
      await screen.findByText(
        "Delivery is not currently available for this state.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Paystack")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Continue to payment" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("offers multiple configured methods and requires a selection", async () => {
    setup();
    mock.request.mockImplementation(async (path: string) => {
      if (path === "/checkout/current") return draft;
      if (path === "/checkout/destinations") return places;
      if (path.startsWith("/checkout/shipping-methods?"))
        return [
          {
            code: "STANDARD",
            name: "Standard delivery",
            description: null,
            estimate: null,
            amount_minor: "505",
          },
          {
            code: "EXPRESS",
            name: "Express delivery",
            description: null,
            estimate: null,
            amount_minor: "805",
          },
        ];
      throw new Error("Unexpected request " + path);
    });
    render(<CheckoutPage />);
    await screen.findByLabelText("State");
    await userEvent.selectOptions(screen.getByLabelText("State"), "LAGOS");
    const standard = await screen.findByRole("radio", {
      name: /Standard delivery/,
    });
    const express = screen.getByRole("radio", { name: /Express delivery/ });
    expect((standard as HTMLInputElement).checked).toBe(false);
    expect((express as HTMLInputElement).checked).toBe(false);
    await userEvent.click(express);
    expect((express as HTMLInputElement).checked).toBe(true);
  });
  it("keeps payment and the disabled action visible before delivery is selected", async () => {
    render(<CheckoutPage />);
    await screen.findByRole("heading", { name: "Contact" });
    expect(screen.getByRole("heading", { name: "Payment" })).toBeTruthy();
    expect(screen.getByText("Paystack")).toBeTruthy();
    expect(
      screen.getByText("Complete your delivery details to continue."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Continue to payment" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("keeps address-save confirmation after selecting and changing shipping methods", async () => {
    mock.auth.user = { id: "customer" };
    const initial: Checkout = {
      ...quote,
      ownership: "account",
      status: "DRAFT",
      version: 2,
      shipping_method_code: null,
      fingerprint: null,
      delivery_minor: null,
      tax_minor: null,
      total_minor: null,
      calculation: null,
    };
    const methods = [
      {
        code: "LAGOS",
        name: "Standard delivery",
        description: null,
        estimate: null,
        amount_minor: "505",
      },
      {
        code: "EXPRESS",
        name: "Express delivery",
        description: null,
        estimate: null,
        amount_minor: "805",
      },
    ];
    mock.request.mockImplementation(
      async (path: string, method = "GET", body?: { code?: string }) => {
        if (path === "/checkout/current") return initial;
        if (path === "/checkout/destinations") return places;
        if (path === "/addresses" && method === "GET") return [];
        if (path === "/addresses" && method === "POST")
          return { id: "saved-one", ...address };
        if (path.startsWith("/checkout/shipping-methods?")) return methods;
        if (path.endsWith("/shipping-method") && method === "POST")
          return {
            ...quote,
            ownership: "account",
            version: body?.code === "EXPRESS" ? 3 : 4,
            shipping_method_code: body?.code,
          };
        throw new Error("Unexpected request " + path);
      },
    );
    render(<CheckoutPage />);
    const saveAddress = await screen.findByRole("checkbox", {
      name: "Save this address to my account",
    });
    await userEvent.click(saveAddress);
    await userEvent.click(
      await screen.findByRole("radio", { name: /Express delivery/ }),
    );
    const confirmation = await screen.findByRole("checkbox", {
      name: "Address saved to your account",
    });
    expect((confirmation as HTMLInputElement).checked).toBe(true);
    expect((confirmation as HTMLInputElement).disabled).toBe(true);
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/addresses" && call[1] === "POST",
      ),
    ).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("radio", { name: /Standard delivery/ }),
    );
    await waitFor(() =>
      expect(
        mock.request.mock.calls.filter(
          (call) => call[0].endsWith("/shipping-method") && call[1] === "POST",
        ),
      ).toHaveLength(2),
    );
    expect((confirmation as HTMLInputElement).checked).toBe(true);
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/addresses" && call[1] === "POST",
      ),
    ).toHaveLength(1);
  });
  it("keeps the unchecked address checkbox mounted across shipping changes and saves when checked later", async () => {
    mock.auth.user = { id: "customer" };
    const methods = [
      {
        code: "LAGOS",
        name: "Standard delivery",
        description: null,
        estimate: null,
        amount_minor: "505",
      },
      {
        code: "EXPRESS",
        name: "Express delivery",
        description: null,
        estimate: null,
        amount_minor: "805",
      },
    ];
    mock.request.mockImplementation(
      async (path: string, method = "GET", body?: { code?: string }) => {
        if (path === "/checkout/current")
          return { ...quote, ownership: "account" };
        if (path === "/checkout/destinations") return places;
        if (path === "/addresses" && method === "GET") return [];
        if (path === "/addresses" && method === "POST")
          return { id: "saved-later", ...address };
        if (path.startsWith("/checkout/shipping-methods?")) return methods;
        if (path.endsWith("/shipping-method") && method === "POST")
          return {
            ...quote,
            ownership: "account",
            version: 4,
            shipping_method_code: body?.code,
          };
        throw new Error("Unexpected request " + path);
      },
    );
    render(<CheckoutPage />);
    const checkbox = await screen.findByRole("checkbox", {
      name: "Save this address to my account",
    });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    await userEvent.click(
      await screen.findByRole("radio", { name: /Express delivery/ }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Continue to payment" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(
      screen.getByRole("checkbox", { name: "Save this address to my account" }),
    ).toBe(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    await userEvent.click(checkbox);
    const confirmation = await screen.findByRole("checkbox", {
      name: "Address saved to your account",
    });
    expect(confirmation).toBe(checkbox);
    expect((confirmation as HTMLInputElement).checked).toBe(true);
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/addresses" && call[1] === "POST",
      ),
    ).toHaveLength(1);
  });
  it("keeps the checkout mounted and accepts a newer shipping choice while quoting", async () => {
    let finishExpress!: (value: Checkout) => void;
    const expressResponse = new Promise<Checkout>((resolve) => {
      finishExpress = resolve;
    });
    const methods = [
      {
        code: "LAGOS",
        name: "Standard delivery",
        description: null,
        estimate: null,
        amount_minor: "505",
      },
      {
        code: "EXPRESS",
        name: "Express delivery",
        description: null,
        estimate: null,
        amount_minor: "805",
      },
    ];
    mock.request.mockImplementation(
      async (path: string, method = "GET", body?: { code?: string }) => {
        if (path === "/checkout/current") return quote;
        if (path === "/checkout/destinations") return places;
        if (path.startsWith("/checkout/shipping-methods?")) return methods;
        if (path.endsWith("/shipping-method") && method === "POST") {
          if (body?.code === "EXPRESS") return expressResponse;
          return { ...quote, version: 5 };
        }
        throw new Error("Unexpected request " + path);
      },
    );
    render(<CheckoutPage />);
    const express = await screen.findByRole("radio", {
      name: /Express delivery/,
    });
    const standard = screen.getByRole("radio", { name: /Standard delivery/ });
    const email = screen.getByLabelText("Email");
    const payment = screen.getByRole("heading", { name: "Payment" });
    await userEvent.click(express);
    expect((express as HTMLInputElement).checked).toBe(true);
    expect(
      express.closest("label")?.classList.contains("checkout-method--selected"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Continue to payment" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("status")
        .some(
          (status) =>
            status.textContent ===
            "Delivery, tax and total are being recalculated.",
        ),
    ).toBe(true);
    expect(screen.queryByText(/Updating total/i)).toBeNull();
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some(
          (call) =>
            call[0].endsWith("/shipping-method") && call[2]?.code === "EXPRESS",
        ),
      ).toBe(true),
    );
    expect(screen.getByRole("heading", { name: "Payment" })).toBe(payment);
    expect(screen.getByLabelText("Email")).toBe(email);
    expect(
      screen.getByRole("list", { name: "Items in your order" }),
    ).toBeTruthy();
    await userEvent.click(standard);
    expect((standard as HTMLInputElement).checked).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Continue to payment" })
        .hasAttribute("disabled"),
    ).toBe(true);
    finishExpress({
      ...quote,
      version: 4,
      shipping_method_code: "EXPRESS",
      delivery_minor: "805",
      total_minor: "1962",
    });
    await waitFor(() =>
      expect(
        mock.request.mock.calls.some(
          (call) =>
            call[0].endsWith("/shipping-method") && call[2]?.code === "LAGOS",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Continue to payment" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.queryByText("₦19.62")).toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "test@example.test",
    );
    expect(
      mock.request.mock.calls.filter((call) => call[0].endsWith("/reserve")),
    ).toHaveLength(0);
  });
  it("keeps a failed quote disabled and retries with the selected method", async () => {
    const methods = [
      {
        code: "LAGOS",
        name: "Standard delivery",
        description: null,
        estimate: null,
        amount_minor: "505",
      },
      {
        code: "EXPRESS",
        name: "Express delivery",
        description: null,
        estimate: null,
        amount_minor: "805",
      },
    ];
    let attempts = 0;
    mock.request.mockImplementation(
      async (path: string, method = "GET", body?: { code?: string }) => {
        if (path === "/checkout/current") return quote;
        if (path === "/checkout/destinations") return places;
        if (path.startsWith("/checkout/shipping-methods?")) return methods;
        if (
          path.endsWith("/shipping-method") &&
          method === "POST" &&
          body?.code === "EXPRESS"
        ) {
          attempts++;
          if (attempts === 1) throw new Error("Network unavailable");
          return {
            ...quote,
            version: 4,
            shipping_method_code: "EXPRESS",
            total_minor: "1962",
            delivery_minor: "805",
          };
        }
        throw new Error("Unexpected request " + path);
      },
    );
    render(<CheckoutPage />);
    const express = await screen.findByRole("radio", {
      name: /Express delivery/,
    });
    await userEvent.click(express);
    expect(
      await screen.findByText(
        "We couldn’t update your total. Please try again.",
      ),
    ).toBeTruthy();
    expect((express as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("heading", { name: "Payment" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Continue to payment" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(attempts).toBe(2));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Continue to payment" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  });
  it("keeps checkout visible and payment disabled until a changed cart is revalidated", async () => {
    let confirmCart!: (value: Checkout) => void;
    const refreshed = new Promise<Checkout>((resolve) => {
      confirmCart = resolve;
    });
    let reads = 0;
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((...args) => {
      if (args[0] === "/checkout/current") {
        reads++;
        return reads === 1 ? Promise.resolve(quote) : refreshed;
      }
      return original(...args);
    });
    const page = render(<CheckoutPage />);
    const button = await screen.findByRole("button", {
      name: "Continue to payment",
    });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    mock.cart.version = 3;
    page.rerender(<CheckoutPage />);
    await waitFor(() => expect(reads).toBe(2));
    expect(
      screen.queryByRole("status", { name: "Loading checkout" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Payment" })).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Items in your order" }),
    ).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);
    confirmCart(quote);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  });
  it.each(["guest", "account"])(
    "reserves, places, and opens Paystack directly for %s checkout",
    async (ownership) => {
      if (ownership === "account") mock.auth.user = { id: "customer" };
      setup(quote);
      const original = mock.request.getMockImplementation()!;
      mock.request.mockImplementation(
        async (path: string, method = "GET", body?: unknown, key?: string) => {
          if (path.endsWith("/reserve"))
            return { ...quote, status: "RESERVED", version: 4 };
          if (path === "/orders" && method === "POST")
            return { id: "order-one" };
          if (path === "/orders/order-one/payment-status")
            return {
              order: {
                id: "order-one",
                payment: { state: "NOT_STARTED", available: true },
              },
              attempts: [],
            };
          if (path === "/orders/order-one/payment-attempts")
            return {
              id: "attempt-one",
              authorization_url: "https://checkout.paystack.com/test-token",
            };
          return original(path, method, body, key);
        },
      );
      render(<CheckoutPage />);
      await screen.findByRole("button", { name: "Continue to payment" });
      expect(screen.queryByText("DEVELOPMENT CONFIGURATION ONLY")).toBeNull();
      await userEvent.click(
        screen.getByRole("button", { name: "Continue to payment" }),
      );
      await waitFor(() =>
        expect(mock.redirect).toHaveBeenCalledWith(
          "https://checkout.paystack.com/test-token",
        ),
      );
      expect(mock.push).not.toHaveBeenCalled();
      expect(mock.request).toHaveBeenCalledWith(
        "/checkout/checkout-one/reserve",
        "POST",
        { expected_version: 3, fingerprint: "abc" },
        expect.any(String),
      );
      expect(
        mock.request.mock.calls.some(
          (call) => call[0] === "/orders" && call[1] === "POST",
        ),
      ).toBe(true);
      expect(mock.request).toHaveBeenCalledWith(
        "/orders/order-one/payment-attempts",
        "POST",
        { method: "hosted" },
        expect.any(String),
      );
      expect(
        screen.getByRole("button", { name: "Redirecting to Paystack…" }),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /pay now/i })).toBeNull();
    },
  );
  it("retains the order and payment key after a lost initialization response", async () => {
    setup(quote);
    const original = mock.request.getMockImplementation()!;
    let paymentCalls = 0;
    mock.request.mockImplementation(
      async (path: string, method = "GET", body?: unknown, key?: string) => {
        if (path.endsWith("/reserve"))
          return { ...quote, status: "RESERVED", version: 4 };
        if (path === "/orders" && method === "POST") return { id: "order-one" };
        if (path === "/orders/order-one/payment-status")
          return {
            order: {
              id: "order-one",
              payment: { state: "PENDING", available: true },
            },
            attempts:
              paymentCalls > 0
                ? [{ id: "attempt-one", status: "PENDING" }]
                : [],
          };
        if (path === "/orders/order-one/payment-attempts/attempt-one/verify")
          return {
            order: {
              id: "order-one",
              payment: { state: "PENDING", available: true },
            },
            attempts: [{ id: "attempt-one", status: "PENDING" }],
          };
        if (path === "/orders/order-one/payment-attempts/attempt-one/resume")
          return {
            id: "attempt-one",
            authorization_url: "https://checkout.paystack.com/replayed",
          };
        if (path === "/orders/order-one/payment-attempts") {
          paymentCalls++;
          if (paymentCalls === 1) throw new Error("Response lost");
          return {
            id: "attempt-one",
            authorization_url: "https://checkout.paystack.com/replayed",
          };
        }
        return original(path, method, body, key);
      },
    );
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Continue to payment" });
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Response lost",
    );
    expect(
      screen.getByRole("button", { name: "Continue to payment" }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await waitFor(() =>
      expect(mock.redirect).toHaveBeenCalledWith(
        "https://checkout.paystack.com/replayed",
      ),
    );
    const payments = mock.request.mock.calls.filter(
      (call) => call[0] === "/orders/order-one/payment-attempts",
    );
    expect(payments).toHaveLength(1);
    expect(
      mock.request.mock.calls.filter((call) => call[0].endsWith("/resume")),
    ).toHaveLength(1);
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/orders"),
    ).toHaveLength(1);
    expect(
      mock.request.mock.calls.filter((call) => call[0].endsWith("/reserve")),
    ).toHaveLength(1);
  });
  it("does not create another payable attempt while initialization is uncertain", async () => {
    setup({ ...quote, status: "RESERVED", order_id: "order-one" });
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation(
      async (path: string, method = "GET", body?: unknown, key?: string) => {
        if (
          path === "/orders/order-one/payment-status" ||
          path.endsWith("/verify")
        )
          return {
            order: {
              id: "order-one",
              payment: { state: "PENDING", available: true },
            },
            attempts: [{ id: "attempt-one", status: "UNKNOWN" }],
          };
        return original(path, method, body, key);
      },
    );
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Continue to payment" });
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "still being checked",
    );
    expect(
      mock.request.mock.calls.filter((call) => call[0].endsWith("/verify")),
    ).toHaveLength(1);
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/orders/order-one/payment-attempts",
      ),
    ).toHaveLength(0);
    expect(mock.redirect).not.toHaveBeenCalled();
  });
  it("locks form fields and prevents duplicate clicks while preparing payment", async () => {
    setup(quote);
    const original = mock.request.getMockImplementation()!;
    let release!: (value: Checkout) => void;
    const reservation = new Promise<Checkout>((resolve) => {
      release = resolve;
    });
    mock.request.mockImplementation(
      (path: string, method = "GET", body?: unknown, key?: string) =>
        path.endsWith("/reserve")
          ? reservation
          : original(path, method, body, key),
    );
    render(<CheckoutPage />);
    const button = await screen.findByRole("button", {
      name: "Continue to payment",
    });
    await userEvent.click(button);
    expect(
      screen
        .getByRole("button", { name: "Preparing payment…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preparing payment…" }));
    expect(
      mock.request.mock.calls.filter((call) => call[0].endsWith("/reserve")),
    ).toHaveLength(1);
    release({ ...quote, status: "RESERVED", version: 4 });
    await screen.findByRole("button", { name: "Continue to payment" });
  });
  it.each([
    "DELIVERY_UNAVAILABLE",
    "TAX_CONFIGURATION_REQUIRED",
    "INSUFFICIENT_STOCK",
  ])("announces %s and focuses the error", async (code) => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Continue to payment" });
    mock.request.mockRejectedValueOnce(
      new CheckoutError(409, code, "Please review configuration or stock."),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByRole("alert");
    expect(document.activeElement?.id).toBe("checkout-errors");
    expect(screen.getByRole("alert").textContent).toContain("Please review");
  });
  it.each(["EXPIRED", "REVIEW_REQUIRED", "CANCELLED"] as const)(
    "shows %s without an active reservation action",
    async (status) => {
      setup({ ...quote, status });
      render(<CheckoutPage />);
      await screen.findByRole("button", { name: "Try checkout again" });
      expect(
        screen.queryByRole("button", {
          name: "Continue to payment",
        }),
      ).toBeNull();
      expect(screen.getByRole("link", { name: "Review my cart" })).toBeTruthy();
      expect(
        screen.queryByRole("complementary", { name: "Order summary" }),
      ).toBeNull();
      expect(mock.cart.items).toHaveLength(1);
    },
  );
  it("starts a fresh checkout only when the customer chooses retry in recovery", async () => {
    setup({ ...quote, status: "REVIEW_REQUIRED" });
    render(<CheckoutPage />);
    await screen.findByRole("heading", {
      name: "Your cart needs a quick review",
    });
    expect(
      screen.getByRole("link", { name: "Review my cart" }).getAttribute("href"),
    ).toBe("/cart");
    expect(
      mock.request.mock.calls.filter(
        (call) => call[0] === "/checkout" && call[1] === "POST",
      ),
    ).toHaveLength(0);
    mock.request.mockResolvedValueOnce(draft);
    await userEvent.click(
      screen.getByRole("button", { name: "Try checkout again" }),
    );
    await screen.findByRole("heading", { name: "Contact" });
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout",
      "POST",
      { expected_version: 2 },
      expect.any(String),
    );
  });
  it("cancels a reservation without deleting its history", async () => {
    setup({ ...quote, status: "RESERVED" });
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Cancel checkout" });
    const originalRequest = mock.request.getMockImplementation();
    mock.request.mockImplementation((...args) =>
      args[0] === "/checkout/checkout-one" && args[1] === "DELETE"
        ? Promise.resolve({ ...quote, status: "CANCELLED" })
        : originalRequest?.(...args),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel checkout" }),
    );
    await screen.findByRole("heading", { name: "Checkout stopped" });
    expect(mock.request).toHaveBeenCalledWith(
      "/checkout/checkout-one",
      "DELETE",
      {},
      expect.any(String),
    );
  });
  it("preserves the retry key after a network failure", async () => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Continue to payment" });
    mock.request.mockRejectedValueOnce(new Error("network"));
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByRole("alert");
    mock.request.mockResolvedValueOnce({ ...quote, status: "RESERVED" });
    await userEvent.click(
      screen.getByRole("button", { name: "Continue to payment" }),
    );
    await screen.findByText(/Your items are reserved until/);
    const calls = mock.request.mock.calls.filter((c) =>
      c[0].endsWith("/reserve"),
    );
    expect(calls[0][3]).toBe(calls[1][3]);
  });
  it("has labeled controls and no axe violations in the address step", async () => {
    render(<CheckoutPage />);
    await screen.findByLabelText("Email");
    const state = screen.getByRole("combobox", { name: "State" });
    expect(state.classList.contains("input")).toBe(true);
    expect(state.querySelector('option[value=""]')?.textContent).toBe(
      "Choose a state",
    );
    expect(state.querySelector('option[value="FCT"]')?.textContent).toBe("FCT");
    const require = createRequire(import.meta.url);
    const axe = require("axe-core");
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations).toEqual([]);
    expect(
      screen.getByLabelText("State").getAttribute("aria-describedby"),
    ).toBeNull();
  });
  it("requires changed delivery details to be saved before confirming the old quote", async () => {
    setup(quote);
    render(<CheckoutPage />);
    const button = await screen.findByRole("button", {
      name: "Continue to payment",
    });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "2 Different Road" },
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(
        "Your delivery details changed. The total will refresh automatically.",
      ),
    ).toBeTruthy();
  });
  it("requires a changed email to be saved without claiming shipping changed", async () => {
    setup(quote);
    render(<CheckoutPage />);
    await screen.findByRole("button", {
      name: "Continue to payment",
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.test" },
    });
    expect(
      screen
        .getByRole("button", { name: "Continue to payment" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByText(
        "Your delivery details changed. The total will refresh automatically.",
      ),
    ).toBeNull();
  });
  it("resumes payment for a promoted checkout without offering a second order", async () => {
    setup({ ...quote, status: "RESERVED", order_id: "order-created" });
    render(<CheckoutPage />);
    await screen.findByRole("button", { name: "Continue to payment" });
    expect(
      screen.queryByRole("button", { name: "Start a new checkout" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cancel checkout" }),
    ).toBeNull();
    expect(
      mock.request.mock.calls.filter((call) => call[0] === "/orders"),
    ).toHaveLength(0);
  });
});
