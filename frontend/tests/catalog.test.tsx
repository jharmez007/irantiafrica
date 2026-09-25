// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductDetail } from "../src/components/catalog/product-detail";
import { ProductImage } from "../src/components/catalog/product-image";
import { ProductCard } from "../src/components/catalog/product-card";
import { CategoryCard } from "../src/components/catalog/category-card";
import { Storefront } from "../src/components/catalog/storefront";
import { generateMetadata as categoryMetadata } from "../src/app/categories/[slug]/page";
import {
  CatalogList,
  CatalogLoading,
  CatalogFailure,
} from "../src/components/catalog/catalog-list";
import {
  AdminCatalog,
  ProductEditorFields,
} from "../src/components/catalog/admin-catalog";
import {
  money,
  resolveVariant,
  catalogParams,
  canManageCatalog,
  type Product,
} from "../src/lib/catalog";
const mocks = vi.hoisted(() => ({
  auth: {
    user: null as null | { authentication_state: string; roles: string[] },
    loading: false,
  },
  api: vi.fn(),
  serverApi: vi.fn(),
}));
vi.mock("@/components/cart/cart-provider", () => ({
  useCart: () => ({
    cart: { item_count: 0 },
    loading: false,
    busy: false,
    error: "",
    add: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/catalog-admin-api", () => ({
  catalogAdmin: mocks.api,
  uploadImage: vi.fn(),
}));
vi.mock("@/lib/catalog-server", () => ({
  catalogFetch: mocks.serverApi,
  catalogMetadata: (title: string) => ({ title }),
}));
const product: Product = {
  id: "p",
  available: true,
  name: "Woven textile",
  slug: "woven-textile",
  description: "Client-approved product facts.",
  kind: "variant",
  currency: "NGN",
  price_min_minor: "10000",
  price_max_minor: "20000",
  categories: [{ id: "c", name: "Home", slug: "home", status: "active" }],
  category_ids: ["c"],
  options: [
    {
      id: "material",
      name: "Material",
      values: [
        { id: "cotton", value: "Cotton" },
        { id: "linen", value: "Linen" },
      ],
    },
    {
      id: "finish",
      name: "Finish",
      values: [
        { id: "plain", value: "Plain" },
        { id: "dyed", value: "Dyed" },
      ],
    },
  ],
  variants: [
    {
      id: "v1",
      available: true,
      sku: "COTTON",
      unit_price_minor: "10000",
      currency: "NGN",
      option_value_ids: ["cotton", "plain"],
    },
    {
      id: "v2",
      available: true,
      sku: "LINEN",
      unit_price_minor: "20000",
      currency: "NGN",
      option_value_ids: ["linen", "plain"],
    },
  ],
  media: [
    {
      id: "image",
      variant_id: null,
      alt_text: "Woven textile folded",
      position: 0,
      width: 640,
      height: 480,
      sources: [{ url: "/api/v1/media/image/640", width: 640, height: 480 }],
    },
  ],
  status: "draft",
  content_version: 1,
  tax_category_code: "review-required",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  mocks.auth = { user: null, loading: false };
  mocks.api.mockResolvedValue({
    data: [],
    meta: { page: 1, last_page: 1, total: 0 },
  });
  mocks.serverApi.mockReset();
});
describe("catalog storefront", () => {
  it("allows category-page filters to navigate to another category or all products", async () => {
    const user = userEvent.setup();
    render(
      <CatalogList
        result={{ data: [], meta: { page: 1, last_page: 1, total: 0 } }}
        categories={[
          ...product.categories,
          { name: "Textiles", slug: "textiles" },
        ]}
        params={new URLSearchParams("category=home")}
        path="/categories/home"
      />,
    );
    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    await user.selectOptions(select, "textiles");
    expect(select.form?.getAttribute("action")).toBe("/products");
    expect(new FormData(select.form!).get("category")).toBe("textiles");
    await user.selectOptions(select, "");
    expect(new FormData(select.form!).get("category")).toBe("");
  });
  it("loads every public category page for the filter", async () => {
    mocks.serverApi.mockImplementation(async (path: string) => {
      if (path.startsWith("/products?"))
        return { data: [], meta: { page: 1, last_page: 1, total: 0 } };
      const page = Number(
        new URL(path, "http://localhost").searchParams.get("page"),
      );
      return {
        data: [{ name: `Category ${page}`, slug: `category-${page}` }],
        meta: { page, last_page: 2, total: 2 },
      };
    });
    render(await Storefront({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("option", { name: "Category 2" })).toBeTruthy();
    expect(mocks.serverApi).toHaveBeenCalledWith(
      "/categories?page_size=100&page=2",
    );
  });
  it("keeps filtered category pages out of the index", async () => {
    mocks.serverApi.mockResolvedValue({ data: { name: "Home", slug: "home" } });
    expect(
      (
        await categoryMetadata({
          params: Promise.resolve({ slug: "home" }),
          searchParams: Promise.resolve({}),
        })
      ).robots,
    ).toEqual({ index: true, follow: true });
    expect(
      (
        await categoryMetadata({
          params: Promise.resolve({ slug: "home" }),
          searchParams: Promise.resolve({ q: "woven", page: "2" }),
        })
      ).robots,
    ).toEqual({ index: false, follow: true });
  });
  it("deduplicates actual image widths when derivatives are clamped to a small source", () => {
    const view = render(
      <ProductImage
        image={{
          ...product.media[0],
          sources: [
            { url: "/320.webp", width: 320, height: 240 },
            { url: "/640.webp", width: 500, height: 375 },
            { url: "/1280.webp", width: 500, height: 375 },
          ],
        }}
      />,
    );
    expect(view.container.querySelector("source")?.getAttribute("srcset")).toBe(
      "/320.webp 320w, /1280.webp 500w",
    );
    expect(
      screen.getByAltText("Woven textile folded").getAttribute("width"),
    ).toBe("500");
  });
  it("renders listing, images, search/category state and stable pagination", () => {
    render(
      <CatalogList
        result={{ data: [product], meta: { page: 1, last_page: 2, total: 25 } }}
        categories={product.categories}
        params={new URLSearchParams("q=woven&category=home")}
      />,
    );
    expect(screen.getByRole("heading", { name: "Woven textile" })).toBeTruthy();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "woven",
    );
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "home",
    );
    expect(
      screen.getByAltText("Woven textile folded").getAttribute("src"),
    ).toBe("/api/v1/media/image/640");
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href"),
    ).toContain("q=woven&category=home&page=2");
  });
  it("resolves option combinations and updates exact prices through accessible controls", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={product} />);
    expect(
      screen.getByText("Choose each option to see its price."),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Choose Material"),
      "cotton",
    );
    await user.selectOptions(screen.getByLabelText("Choose Finish"), "plain");
    expect(screen.getByText("₦100.00")).toBeTruthy();
    expect(screen.getByText("SKU: COTTON")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Choose Material"), "linen");
    expect(screen.getByText("₦200.00")).toBeTruthy();
    expect(
      (
        screen.getByRole("option", {
          name: "Dyed — unavailable",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("renders a simple product without fictional selectors", () => {
    render(
      <ProductDetail
        product={{
          ...product,
          kind: "simple",
          options: [],
          variants: [{ ...product.variants[0], option_value_ids: [] }],
        }}
      />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("SKU: COTTON")).toBeTruthy();
  });
  it("retains product information and exact price when a simple SKU is out of stock", () => {
    render(
      <ProductDetail
        product={{
          ...product,
          available: false,
          kind: "simple",
          options: [],
          variants: [
            { ...product.variants[0], available: false, option_value_ids: [] },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: product.name })).toBeTruthy();
    expect(screen.getByText("₦100.00")).toBeTruthy();
    expect(screen.getByText("Out of stock")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("disables options that can only lead to out-of-stock variants", async () => {
    render(
      <ProductDetail
        product={{
          ...product,
          variants: [
            { ...product.variants[0], available: false },
            product.variants[1],
          ],
        }}
      />,
    );
    expect(
      (
        screen.getByRole("option", {
          name: "Cotton — unavailable",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("option", { name: "Linen" }) as HTMLOptionElement)
        .disabled,
    ).toBe(false);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Choose Material"), "linen");
    await user.selectOptions(screen.getByLabelText("Choose Finish"), "plain");
    expect(screen.getByText("In stock")).toBeTruthy();
    expect(screen.getByText("₦200.00")).toBeTruthy();
  });
  it("renders loading, empty and safe failure states", () => {
    render(
      <>
        <CatalogLoading />
        <CatalogFailure />
        <CatalogList
          result={{ data: [], meta: { page: 1, last_page: 1, total: 0 } }}
          categories={[]}
          params={new URLSearchParams()}
        />
      </>,
    );
    expect(screen.getByText("Loading the collection…")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("could not load");
    expect(screen.getByText("No products match these filters.")).toBeTruthy();
  });
  it("uses real product imagery and prices in reusable cards without cart or development messaging", () => {
    render(
      <>
        <ProductCard product={{ ...product, available: false }} />
        <CategoryCard category={product.categories[0]} index={0} />
      </>,
    );
    expect(screen.getByRole("heading", { name: product.name })).toBeTruthy();
    expect(screen.getByText("₦100.00 – ₦200.00")).toBeTruthy();
    expect(screen.getByText("Out of stock")).toBeTruthy();
    expect(
      screen.getByAltText("Woven textile folded").getAttribute("src"),
    ).toBe(product.media[0].sources[0].url);
    expect(
      screen.getByRole("link", { name: "Home" }).getAttribute("href"),
    ).toBe("/categories/home");
    expect(screen.queryByRole("button", { name: /cart/i })).toBeNull();
    expect(
      screen.queryByText(/Ordering is not available|engineering/i),
    ).toBeNull();
  });
  it("switches gallery images with labelled buttons while retaining variant controls", async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        product={{
          ...product,
          media: [
            ...product.media,
            {
              ...product.media[0],
              id: "detail-image",
              alt_text: "Woven textile detail",
              sources: [{ url: "/detail.webp", width: 640, height: 480 }],
            },
          ],
        }}
      />,
    );
    const first = screen.getByRole("button", { name: "View image 1 of 2" });
    const second = screen.getByRole("button", { name: "View image 2 of 2" });
    expect(first.getAttribute("aria-pressed")).toBe("true");
    await user.click(second);
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByAltText("Woven textile detail").getAttribute("src"),
    ).toBe("/detail.webp");
    await user.selectOptions(screen.getByLabelText("Choose Material"), "linen");
    await user.selectOptions(screen.getByLabelText("Choose Finish"), "plain");
    expect(screen.getByText("₦200.00")).toBeTruthy();
    expect(screen.queryByText(/Ordering is not available/i)).toBeNull();
  });
  it("preserves price filters when submitting refined search controls", () => {
    const view = render(
      <CatalogList
        result={{ data: [], meta: { page: 1, last_page: 1, total: 0 } }}
        categories={product.categories}
        params={
          new URLSearchParams(
            "q=woven&min_price=100&max_price=500&sort=price_asc",
          )
        }
      />,
    );
    const data = new FormData(view.container.querySelector("form")!);
    expect(data.get("min_price")).toBe("100");
    expect(data.get("max_price")).toBe("500");
    expect(data.get("sort")).toBe("price_asc");
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeTruthy();
  });
  it("preserves integer precision and rejects incomplete or archived choices", () => {
    expect(money("999999999999999")).toBe("₦9,999,999,999,999.99");
    expect(resolveVariant(product, { material: "cotton" })).toBeUndefined();
    expect(
      resolveVariant(
        {
          ...product,
          variants: product.variants.map((v) => ({ ...v, status: "archived" })),
        },
        { material: "cotton", finish: "plain" },
      ),
    ).toBeUndefined();
    expect(
      catalogParams({
        q: "basket",
        status: "draft",
        page: ["1", "2"],
      }).toString(),
    ).toBe("q=basket");
  });
});
describe("catalog administration", () => {
  it("loads later category pages and preserves those memberships when editing a product", async () => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["owner"],
    };
    const selectedProduct = { ...product, category_ids: ["second"] };
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/products/p") return { data: selectedProduct };
      if (path.startsWith("/products?"))
        return {
          data: [selectedProduct],
          meta: { page: 1, last_page: 1, total: 1 },
        };
      const page = Number(
        new URL(path, "http://localhost").searchParams.get("page"),
      );
      return {
        data: [
          {
            id: page === 1 ? "first" : "second",
            name: `Category ${page}`,
            slug: `category-${page}`,
            status: "active",
          },
        ],
        meta: { page, last_page: 2, total: 2 },
      };
    });
    const user = userEvent.setup();
    render(<AdminCatalog />);
    await user.click(
      await screen.findByRole("button", { name: "Woven textile — draft" }),
    );
    const section = (
      await screen.findByRole("heading", { name: "Woven textile — draft" })
    ).closest("section")!;
    expect(
      (
        within(section).getByRole("checkbox", {
          name: "Category 2 (active)",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await user.click(
      within(section).getByRole("button", { name: "Save product" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/products/p",
        "PATCH",
        expect.objectContaining({ category_ids: ["second"] }),
      ),
    );
  });
  it("preserves existing memberships if category metadata is temporarily missing", () => {
    const view = render(
      <form>
        <ProductEditorFields product={product} categories={[]} />
      </form>,
    );
    expect(
      new FormData(view.container.querySelector("form")!).getAll(
        "category_ids",
      ),
    ).toEqual(["c"]);
  });
  it("renders create and edit form fields with category membership", () => {
    render(
      <form>
        <ProductEditorFields
          product={product}
          categories={product.categories}
        />
      </form>,
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      product.name,
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.queryByLabelText("Product type")).toBeNull();
  });
  it("denies customers and requires MFA before fetching admin data", () => {
    mocks.auth.user = {
      authentication_state: "mfa_required",
      roles: ["owner"],
    };
    const view = render(<AdminCatalog />);
    expect(
      screen.getByRole("link", { name: "Complete staff verification" }),
    ).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalled();
    mocks.auth.user = { authentication_state: "authenticated", roles: [] };
    view.rerender(<AdminCatalog />);
    expect(screen.getByRole("alert").textContent).toContain(
      "do not have catalog access",
    );
  });
  it("keeps non-owner staff read-only", async () => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["inventory_store"],
    };
    render(<AdminCatalog />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(screen.getByText("Read-only catalog access.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create draft" })).toBeNull();
    expect(canManageCatalog(["order_processing"])).toBe(false);
  });
  it("submits an owner draft with explicit data and displays server validation errors", async () => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["owner"],
    };
    const user = userEvent.setup();
    render(<AdminCatalog />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
    await user.type(screen.getByLabelText("Name"), "New item");
    await user.type(
      screen.getByLabelText("Tax category reference"),
      "review-required",
    );
    mocks.api.mockRejectedValueOnce(
      new Error("The name has already been taken."),
    );
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "already been taken",
      ),
    );
    expect(mocks.api).toHaveBeenCalledWith("/products", "POST", {
      name: "New item",
      description: "",
      tax_category_code: "review-required",
      category_ids: [],
      kind: "simple",
    });
  });
});
