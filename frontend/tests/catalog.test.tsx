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
import { toast } from "../src/lib/toast";
import { ProductDetail } from "../src/components/catalog/product-detail";
import { ProductImage } from "../src/components/catalog/product-image";
import { ProductCard } from "../src/components/catalog/product-card";
import { RelatedProducts } from "../src/components/catalog/related-products";
import { selectRelated } from "../src/lib/recommendations";
import { CategoryCard } from "../src/components/catalog/category-card";
import { Storefront } from "../src/components/catalog/storefront";
import { generateMetadata as categoryMetadata } from "../src/app/categories/[slug]/page";
import {
  CatalogList,
  CatalogLoading,
  CatalogFailure,
} from "../src/components/catalog/catalog-list";
import { AdminCatalog } from "../src/components/catalog/admin-catalog";
import { AdminCategories } from "../src/components/catalog/admin-categories";
import { AdminProductEditor } from "../src/components/catalog/product-editor";
import { ActionMenu } from "../src/components/admin/primitives";
import { allCategories } from "../src/components/catalog/admin-common";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/products",
}));
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
  upload: vi.fn(),
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
  uploadImage: mocks.upload,
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
      status: "active",
      price_version: 1,
    },
    {
      id: "v2",
      available: true,
      sku: "LINEN",
      unit_price_minor: "20000",
      currency: "NGN",
      option_value_ids: ["linen", "plain"],
      status: "active",
      price_version: 1,
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

describe("deterministic product discovery", () => {
  const published = { ...product, status: "published" as const };
  const candidate = (slug: string, category = "home", price = "10000") => ({
    ...published,
    id: slug,
    slug,
    name: slug,
    price_min_minor: price,
    categories: [{ ...product.categories[0], slug: category }],
  });
  it("prioritizes same-category and close-price products, excluding current and unavailable items", () => {
    const selected = selectRelated(
      published,
      [
        candidate("far", "other", "10001"),
        candidate("close", "home", "11000"),
        candidate("current", "home", "10000"),
        candidate("near", "home", "10001"),
        { ...candidate("sold-out"), available: false },
        { ...candidate("draft"), status: "draft" },
      ],
      new Set(["current"]),
    );
    expect(selected.map((item) => item.slug)).toEqual(["near", "close", "far"]);
    expect(selectRelated(published, [published])).toHaveLength(0);
  });
  it("renders bounded related cards with a stable catalogue fallback", async () => {
    const primary = [published, candidate("same-category")];
    const fallback = [
      candidate("different", "other"),
      candidate("another", "other"),
    ];
    mocks.serverApi.mockImplementation(async (path: string) => ({
      data: path.includes("category=") ? primary : fallback,
    }));
    render(await RelatedProducts({ product: published }));
    expect(
      screen.getByRole("heading", { name: "You may also like" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(
      document.querySelector('a[href="/products/woven-textile"]'),
    ).toBeNull();
    expect(mocks.serverApi).toHaveBeenCalledWith(
      "/products?category=home&page_size=8",
    );
    expect(mocks.serverApi).toHaveBeenCalledWith(
      "/products?sort=newest&page_size=8",
    );
  });
});

describe("simplified product editor", () => {
  beforeEach(() => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["owner"],
    };
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: product }
        : path === "/tax-categories"
          ? {
              data: [{ code: "STANDARD", label: "Standard tax treatment" }],
              development_only: true,
            }
          : { data: product.categories, meta: { last_page: 1 } },
    );
  });

  it("guides variant generation with exact naira prices", async () => {
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Pricing & Variants" });
    await userEvent.click(
      screen.getByRole("tab", { name: "Pricing & Variants" }),
    );
    await userEvent.type(
      screen.getByLabelText("SKU for Cotton / Dyed"),
      "COTTON-DYED",
    );
    await userEvent.type(
      screen.getByLabelText("Price for Cotton / Dyed"),
      "4,500.50",
    );
    await userEvent.type(
      screen.getByLabelText("SKU for Linen / Dyed"),
      "LINEN-DYED",
    );
    await userEvent.type(
      screen.getByLabelText("Price for Linen / Dyed"),
      "5000",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Generate 2 variants" }),
    );
    expect(
      screen.getByText(/4 combinations: 2 saved, 2 new variants/),
    ).toBeTruthy();
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/products/p/variants", "POST", {
        sku: "COTTON-DYED",
        unit_price_minor: "450050",
        option_value_ids: ["cotton", "dyed"],
      }),
    );
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.filter(
          ([path, method]) =>
            path === "/products/p/variants" && method === "POST",
        ),
      ).toHaveLength(2),
    );
    expect(
      within(screen.getByRole("region", { name: "Variant summary" })).getByText(
        "₦100.00",
      ),
    ).toBeTruthy();
  });

  it("removes draft option values and whole options while updating combination count", async () => {
    let current = { ...product, variants: [] as Product["variants"] };
    mocks.api.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/products/p") return { data: current };
      if (path === "/tax-categories")
        return { data: [], development_only: false };
      if (path === "/options/material/values/linen" && method === "DELETE") {
        current = {
          ...current,
          content_version: 2,
          options: current.options.map((option) =>
            option.id === "material"
              ? {
                  ...option,
                  values: option.values.filter((value) => value.id !== "linen"),
                }
              : option,
          ),
        };
        return { data: current };
      }
      if (path === "/options/finish" && method === "DELETE") {
        current = {
          ...current,
          content_version: 3,
          options: current.options.filter((option) => option.id !== "finish"),
        };
        return { data: current };
      }
      return { data: product.categories, meta: { last_page: 1 } };
    });
    const nativeConfirmation = vi.spyOn(window, "confirm");
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Pricing & Variants" });
    await userEvent.click(
      screen.getByRole("tab", { name: "Pricing & Variants" }),
    );
    expect(
      screen.getByText(/4 combinations: 0 saved, 4 new variants/),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Material Linen" }),
    );
    expect(
      await screen.findByText(/2 combinations: 0 saved, 2 new variants/),
    ).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith(
      "/options/material/values/linen",
      "DELETE",
      { content_version: 1 },
    );
    await userEvent.click(
      within(screen.getByLabelText("Finish option")).getByRole("button", {
        name: "Remove option",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Remove Finish option?",
    });
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/options/finish",
      "DELETE",
      expect.anything(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Remove Finish option?" }),
    ).toBeNull();
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/options/finish",
      "DELETE",
      expect.anything(),
    );
    await userEvent.click(
      within(screen.getByLabelText("Finish option")).getByRole("button", {
        name: "Remove option",
      }),
    );
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "Remove Finish option?" }),
      ).getByRole("button", {
        name: "Remove option",
      }),
    );
    expect(
      await screen.findByText(/1 combination: 0 saved, 1 new variant/),
    ).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith("/options/finish", "DELETE", {
      content_version: 2,
    });
    expect(nativeConfirmation).not.toHaveBeenCalled();
    nativeConfirmation.mockRestore();
  });

  it("removes a saved variant from sale without deleting its SKU or other combinations", async () => {
    let current = product;
    mocks.api.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/products/p") return { data: current };
      if (path === "/tax-categories")
        return { data: [], development_only: false };
      if (path === "/variants/v1" && method === "PATCH") {
        current = {
          ...current,
          variants: current.variants.map((variant) =>
            variant.id === "v1"
              ? { ...variant, status: "archived", price_version: 2 }
              : variant,
          ),
        };
        return { data: current };
      }
      return { data: product.categories, meta: { last_page: 1 } };
    });
    const nativeConfirmation = vi.spyOn(window, "confirm");
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Pricing & Variants" });
    await userEvent.click(
      screen.getByRole("tab", { name: "Pricing & Variants" }),
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: "Remove from sale" })[0],
    );
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/variants/v1",
      "PATCH",
      expect.anything(),
    );
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "Remove variant from sale?" }),
      ).getByRole("button", {
        name: "Remove from sale",
      }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/variants/v1", "PATCH", {
        status: "archived",
        price_version: 1,
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Restore to sale" }),
    ).toBeTruthy();
    expect(current.variants.map((variant) => variant.sku)).toEqual([
      "COTTON",
      "LINEN",
    ]);
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/variants/v1",
      "DELETE",
      expect.anything(),
    );
    expect(nativeConfirmation).not.toHaveBeenCalled();
    nativeConfirmation.mockRestore();
  });

  it("provides gallery ordering, description editing and a product-specific inventory link", async () => {
    const second = {
      ...product.media[0],
      id: "image-2",
      position: 1,
      alt_text: "Reverse side",
    };
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: { ...product, media: [...product.media, second] } }
        : path === "/tax-categories"
          ? { data: [], development_only: false }
          : { data: product.categories, meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Image 2 actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Make main image" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/media/image-2", "PATCH", {
        position: 0,
      }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Inventory" }));
    expect(
      screen
        .getByRole("link", { name: "Manage inventory" })
        .getAttribute("href"),
    ).toContain("product=p");
  });

  it("confirms gallery image removal in the app without a browser prompt", async () => {
    let current = product;
    mocks.api.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/products/p") return { data: current };
      if (path === "/tax-categories")
        return { data: [], development_only: false };
      if (path === "/media/image" && method === "DELETE") {
        current = { ...current, media: [] };
        return { data: current };
      }
      return { data: product.categories, meta: { last_page: 1 } };
    });
    const nativeConfirmation = vi.spyOn(window, "confirm");
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Image 1 actions" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this image?" });
    expect(mocks.api).not.toHaveBeenCalledWith("/media/image", "DELETE");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Remove this image?" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Image 1 actions" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "Remove this image?" }),
      ).getByRole("button", {
        name: "Remove image",
      }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/media/image", "DELETE"),
    );
    expect(
      await screen.findByText("No images yet. Add a product image below."),
    ).toBeTruthy();
    expect(nativeConfirmation).not.toHaveBeenCalled();
    nativeConfirmation.mockRestore();
  });

  it("uploads an image and reports processing without a manual refresh", async () => {
    let current = product;
    const success = vi.spyOn(toast, "success");
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: current }
        : path === "/tax-categories"
          ? { data: [], development_only: false }
          : { data: product.categories, meta: { last_page: 1 } },
    );
    mocks.upload.mockImplementation(async () => {
      current = {
        ...current,
        media: [
          ...current.media,
          {
            ...current.media[0],
            id: "new-image",
            position: 1,
            status: "processing",
          },
        ],
      };
    });
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    await userEvent.upload(
      screen.getByLabelText(/Drag an image here or choose an image/),
      new File(["image"], "product.png", { type: "image/png" }),
    );
    expect(screen.getByText("Selected file: product.png")).toBeTruthy();
    expect(screen.queryByAltText("Selected image preview")).toBeNull();
    await userEvent.type(
      screen.getByLabelText("Image description"),
      "Woven textile on a table",
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload image" }));
    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith(
        "p",
        expect.any(File),
        "Woven textile on a table",
      ),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Image uploaded. Processing image…"),
    );
    expect(
      await screen.findByRole("button", { name: "Image 2 actions" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        (
          screen.getByLabelText(
            /Drag an image here or choose an image/,
          ) as HTMLInputElement
        ).files?.length,
      ).toBe(0);
      expect(
        (screen.getByLabelText("Image description") as HTMLInputElement).value,
      ).toBe("");
      expect(screen.queryByAltText("Selected image preview")).toBeNull();
      expect(screen.queryByText("Selected file: product.png")).toBeNull();
    });
  });
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
        <CategoryCard category={product.categories[0]} />
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
  it("uses the supplied category artwork and a quiet fallback instead of sequence numbers", () => {
    render(
      <>
        <CategoryCard
          category={{ name: "Baskets & Storage", slug: "baskets-storage" }}
        />
        <CategoryCard category={{ name: "Home Décor", slug: "home-decor" }} />
        <CategoryCard
          category={{ name: "Future collection", slug: "future" }}
        />
      </>,
    );
    expect(
      screen
        .getByAltText("Sunlit woven storage baskets with olive greenery")
        .getAttribute("src"),
    ).toContain("sunlit_woven_baskets_and_olive_greenery.png");
    expect(
      screen
        .getByAltText("Earthy home décor vignette in warm sunlight")
        .getAttribute("src"),
    ).toContain("sunlit_earthy_boho_vignette.png");
    expect(screen.queryByText("02")).toBeNull();
    expect(screen.queryByText("04")).toBeNull();
    expect(document.querySelector(".category-card-fallback")).toBeTruthy();
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
  it("loads every category page", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      const page = Number(
        new URL(path, "http://localhost").searchParams.get("page"),
      );
      return { data: [{ id: String(page) }], meta: { last_page: 2 } };
    });
    expect(await allCategories()).toEqual([{ id: "1" }, { id: "2" }]);
  });
  it("denies customers and requires MFA before fetching admin data", () => {
    mocks.auth.user = {
      authentication_state: "mfa_required",
      roles: ["owner"],
    };
    const view = render(<AdminCatalog />);
    expect(screen.getByText("Complete staff verification")).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalled();
    mocks.auth.user = { authentication_state: "authenticated", roles: [] };
    view.rerender(<AdminCatalog />);
    expect(screen.getByRole("alert").textContent).toContain(
      "do not have access",
    );
  });
  it("keeps non-owner staff read-only", async () => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["inventory_store"],
    };
    render(<AdminCatalog />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(screen.queryByText("Add Product")).toBeNull();
    expect(canManageCatalog(["order_processing"])).toBe(false);
  });
  it("keeps existing categories while saving and accepts configured tax choices only", async () => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["owner"],
    };
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: product }
        : path === "/tax-categories"
          ? {
              data: [
                { code: product.tax_category_code, label: "Configured tax" },
              ],
              development_only: true,
            }
          : { data: [], meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByLabelText("Product name");
    expect(screen.queryByLabelText("Tax category reference")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/products/p",
        "PATCH",
        expect.objectContaining({ category_ids: ["c"] }),
      ),
    );
  });
  it("refreshes media and uses its current product version when publishing", async () => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["owner"],
    };
    let reads = 0;
    const pending = {
      ...product,
      content_version: 2,
      publication_issues: [
        "Add an image and wait for it to finish processing.",
      ],
      media: [{ ...product.media[0], status: "processing" }],
    };
    const ready = {
      ...pending,
      content_version: 3,
      publication_issues: [],
      media: [{ ...product.media[0], status: "ready" }],
    };
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: ++reads === 1 ? pending : ready }
        : path.includes("publication")
          ? { data: { ...ready, status: "published" } }
          : path === "/tax-categories"
            ? { data: [], development_only: false }
            : { data: product.categories, meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByText("Needs attention: Image");
    expect(
      (
        screen.getByRole("button", {
          name: "Publish product",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await waitFor(
      () =>
        expect(
          (
            screen.getByRole("button", {
              name: "Publish product",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false),
      { timeout: 5000 },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Publish product" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/products/p/publication",
        "POST",
        { content_version: 3 },
      ),
    );
  });
});

describe("UAT catalog workflow", () => {
  beforeEach(() => {
    mocks.auth.user = {
      authentication_state: "authenticated",
      roles: ["owner"],
    };
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  });
  it("saves a name-only draft with unavailable tax setup", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products"
        ? { data: { ...product, status: "draft", tax_category_code: null } }
        : { data: [], meta: { last_page: 1 } },
    );
    render(<AdminProductEditor />);
    await userEvent.type(
      screen.getByLabelText("Product name"),
      "Incomplete draft",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save and continue" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/products",
        "POST",
        expect.objectContaining({ name: "Incomplete draft", kind: "simple" }),
      ),
    );
    const call = mocks.api.mock.calls.find(
      (c) => c[0] === "/products" && c[1] === "POST",
    );
    expect(call?.[2]).not.toHaveProperty("tax_category_code");
  });
  it("shows friendly configured choices without technical references", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path === "/tax-categories"
        ? {
            data: [
              { code: "INTERNAL_STANDARD", label: "Standard taxable" },
              { code: "INTERNAL_EXEMPT", label: "Exempt" },
            ],
          }
        : { data: [], meta: { last_page: 1 } },
    );
    render(<AdminProductEditor />);
    await screen.findByText("More settings");
    await userEvent.click(screen.getByText("More settings"));
    const select = screen.getByLabelText("Tax treatment");
    expect(select.tagName).toBe("SELECT");
    expect(select.textContent).not.toContain("INTERNAL");
    expect((select as HTMLSelectElement).required).toBe(false);
    expect(
      screen.getByRole("option", { name: "Standard taxable" }),
    ).toBeTruthy();
  });
  it("uses the sole configured treatment automatically with no ordinary selector", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path === "/tax-categories"
        ? { data: [{ code: "INTERNAL_STANDARD", label: "Standard taxable" }] }
        : { data: [], meta: { last_page: 1 } },
    );
    render(<AdminProductEditor />);
    await screen.findByText(/Applied automatically/);
    expect(screen.queryByLabelText("Tax treatment")).toBeNull();
    expect(screen.queryByText(/INTERNAL_STANDARD/)).toBeNull();
  });
  it("keeps Edit outside the archived overflow and restores through confirmation", async () => {
    let restored = false;
    const success = vi.spyOn(toast, "success");
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (method === "POST") {
        restored = true;
        return { data: { ...product, status: "draft" } };
      }
      return path.startsWith("/products?")
        ? {
            data: [{ ...product, status: restored ? "draft" : "archived" }],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } };
    });
    render(<AdminCatalog />);
    await screen.findByRole("link", { name: "Edit" });
    const summary = screen.getByRole("button", { name: "More actions" });
    await userEvent.click(summary);
    const menu = summary.parentElement!;
    expect(within(menu).queryByRole("link", { name: "Edit" })).toBeNull();
    expect(within(menu).queryByText("Archive")).toBeNull();
    await userEvent.click(
      within(menu).getByRole("button", { name: "Restore" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restore to Draft" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/products/p/restore", "POST", {
        content_version: product.content_version,
      }),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "Product restored to draft",
        "Review before publishing.",
      ),
    );
  });
  it("keeps only one product popover open and closes it on outside pointer", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/products?")
        ? {
            data: [
              { ...product, id: "first", name: "First draft", status: "draft" },
              {
                ...product,
                id: "second",
                name: "Second draft",
                status: "draft",
              },
            ],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } },
    );
    render(<AdminCatalog />);
    const triggers = await screen.findAllByRole("button", {
      name: "More actions",
    });
    expect(triggers).toHaveLength(2);
    expect(triggers[0].getAttribute("type")).toBe("button");
    await userEvent.click(triggers[0]);
    expect(triggers[0].getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(triggers[1]);
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
    expect(triggers[1].getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(screen.getByRole("heading", { name: "Products" }));
    expect(triggers[1].getAttribute("aria-expanded")).toBe("false");
  });
  it("uses one shared menu state across rows, toggles, and returns focus on Escape", async () => {
    render(
      <>
        <ActionMenu label="More actions" compact>
          <button type="button">First action</button>
        </ActionMenu>
        <ActionMenu label="More actions" compact>
          <button type="button">Second action</button>
        </ActionMenu>
      </>,
    );
    const [first, second] = screen.getAllByRole("button", {
      name: "More actions",
    });
    await userEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(second);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(second);
    await userEvent.click(second);
    await userEvent.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(first);
    await userEvent.click(document.body);
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });
  it("confirms eligible product deletion, refreshes, and reports success", async () => {
    let removed = false;
    const success = vi.spyOn(toast, "success");
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (path === "/products/p" && method === "DELETE") {
        removed = true;
        return undefined;
      }
      return path.startsWith("/products?")
        ? {
            data: removed
              ? []
              : [
                  {
                    ...product,
                    media: [],
                    delete_eligibility: { allowed: true, reason: null },
                  },
                ],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } };
    });
    render(<AdminCatalog />);
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete product" }),
    );
    expect(
      screen.getByText(/no historical sales or operational records/),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/products/p",
      "DELETE",
      expect.anything(),
    );
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete product" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete product" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/products/p", "DELETE", {
        content_version: product.content_version,
      }),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Product deleted successfully."),
    );
    await screen.findByText(/No products/);
  });
  it("hides blocked product deletion and preserves failure context", async () => {
    const error = vi.spyOn(toast, "error");
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (method === "DELETE")
        throw new Error("This record now has history. Archive it instead.");
      return path.startsWith("/products?")
        ? {
            data: [
              {
                ...product,
                status: "draft",
                media: [],
                delete_eligibility: { allowed: true, reason: null },
              },
            ],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } };
    });
    render(<AdminCatalog />);
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete product" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete product" }),
    );
    await screen.findByText("This record now has history. Archive it instead.");
    expect(error).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/products?")
        ? {
            data: [
              {
                ...product,
                delete_eligibility: {
                  allowed: false,
                  reason: "Archive it instead.",
                },
              },
            ],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } },
    );
    render(<AdminCatalog />);
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    expect(screen.queryByRole("button", { name: "Delete product" })).toBeNull();
  });
  it("confirms empty category deletion and hides deletion for assigned categories", async () => {
    let removed = false;
    const success = vi.spyOn(toast, "success");
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (path === "/categories/empty" && method === "DELETE") {
        removed = true;
        return undefined;
      }
      return path.startsWith("/categories?")
        ? {
            data: [
              {
                id: "assigned",
                name: "Assigned",
                slug: "assigned",
                status: "active",
                delete_eligibility: {
                  allowed: false,
                  reason: "Products assigned",
                },
              },
              ...(removed
                ? []
                : [
                    {
                      id: "empty",
                      name: "Empty",
                      slug: "empty",
                      status: "active",
                      delete_eligibility: { allowed: true, reason: null },
                    },
                  ]),
            ],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } };
    });
    render(<AdminCategories />);
    const triggers = await screen.findAllByRole("button", {
      name: "More actions",
    });
    await userEvent.click(triggers[0]);
    expect(
      screen.queryByRole("button", { name: "Delete category" }),
    ).toBeNull();
    await userEvent.click(triggers[1]);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete category" }),
    );
    expect(screen.getByText(/Products must be reassigned/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete category" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/categories/empty", "DELETE"),
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Category deleted successfully."),
    );
    expect(screen.queryByRole("rowheader", { name: "Empty" })).toBeNull();
  });
  it("keeps the category confirmation open and reports a safe deletion failure", async () => {
    const error = vi.spyOn(toast, "error");
    mocks.api.mockImplementation(async (path: string, method?: string) => {
      if (method === "DELETE")
        throw new Error(
          "This category cannot be deleted while products are assigned to it.",
        );
      return path.startsWith("/categories?")
        ? {
            data: [
              {
                id: "c",
                name: "Test category",
                slug: "test-category",
                status: "draft",
                delete_eligibility: { allowed: true, reason: null },
              },
            ],
            meta: { last_page: 1 },
          }
        : { data: [], meta: { last_page: 1 } };
    });
    render(<AdminCategories />);
    await userEvent.click(
      await screen.findByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete category" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete category" }),
    );
    await screen.findByText(
      "This category cannot be deleted while products are assigned to it.",
    );
    expect(error).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("rowheader", { name: "Test category" }),
    ).toBeTruthy();
  });
  it.each([
    ["draft", ["Archive"], ["View storefront", "Restore"]],
    ["published", ["View storefront", "Archive"], ["Publish", "Restore"]],
    ["archived", ["Restore"], ["Publish", "Archive", "View storefront"]],
  ] as const)(
    "shows valid %s product actions only",
    async (status, present, absent) => {
      mocks.api.mockImplementation(async (path: string) =>
        path.startsWith("/products?")
          ? {
              data: [{ ...product, status, publication_issues: [] }],
              meta: { last_page: 1 },
            }
          : { data: [], meta: { last_page: 1 } },
      );
      render(<AdminCatalog />);
      const edit = await screen.findByRole("link", { name: "Edit" });
      expect(edit.getAttribute("class")).toContain("button--secondary");
      const trigger = screen.getByRole("button", { name: "More actions" });
      await userEvent.click(trigger);
      const popover = document.getElementById(
        trigger.getAttribute("aria-controls")!,
      )!;
      expect(popover.hasAttribute("hidden")).toBe(false);
      expect(within(popover).queryByRole("link", { name: "Edit" })).toBeNull();
      for (const label of present)
        expect(within(popover).getByText(label)).toBeTruthy();
      if (status === "draft")
        expect(within(popover).getByText("Publish")).toBeTruthy();
      for (const label of absent)
        expect(within(popover).queryByText(label)).toBeNull();
      for (const button of within(popover).queryAllByRole("button")) {
        expect(button.getAttribute("type")).toBe("button");
      }
    },
  );
});
