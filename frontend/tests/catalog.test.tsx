// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
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
import {
  AddOptionForm,
  AddValueForm,
  ColourValueDialog,
} from "../src/components/catalog/admin-colour-swatch";
import { isColourOption, resolveSwatch } from "../src/lib/colour-swatches";
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
  cartAdd: vi.fn(),
}));
vi.mock("@/components/cart/cart-provider", () => ({
  useCart: () => ({
    cart: { item_count: 0 },
    loading: false,
    busy: false,
    error: "",
    add: mocks.cartAdd,
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
      available_quantity: 6,
      availability_status: "in_stock",
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
      available_quantity: 8,
      availability_status: "in_stock",
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
  vi.unstubAllGlobals();
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

describe("admin colour swatches", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  });
  it("uses explicit safe hex before the small fallback map", () => {
    expect(isColourOption(" Colour ")).toBe(true);
    expect(isColourOption("Colorway")).toBe(true);
    expect(isColourOption("Paper Size")).toBe(false);
    expect(resolveSwatch({ value: "Cognac", swatch_hex: "#123456" })).toBe(
      "#123456",
    );
    expect(resolveSwatch({ value: "Cognac", swatch_hex: "rgb(1,2,3)" })).toBe(
      "#A65A32",
    );
    expect(resolveSwatch({ value: "Oat Milk" })).toBeNull();
  });
  it("prefills only approved names and synchronizes picker and hex input", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ColourValueDialog
        mode="create"
        busy={false}
        existingNames={[]}
        onClose={vi.fn()}
        save={save}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Add colour" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Cognac",
    );
    const hex = screen.getByRole("textbox", {
      name: "Swatch hex",
    }) as HTMLInputElement;
    const picker = screen.getByLabelText(
      "Choose swatch with colour picker",
    ) as HTMLInputElement;
    expect(hex.value).toBe("#A65A32");
    expect(picker.value).toBe("#a65a32");
    fireEvent.change(picker, { target: { value: "#123456" } });
    expect(hex.value).toBe("#123456");
    await user.click(
      within(dialog).getByRole("button", { name: "Add colour" }),
    );
    expect(save).toHaveBeenCalledWith("Cognac", "#123456");
  });

  it("leaves custom names blank and keeps Size free of swatch controls", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = render(
      <ColourValueDialog
        mode="create"
        busy={false}
        existingNames={[]}
        onClose={vi.fn()}
        save={save}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Oat Milk");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Swatch hex",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    await user.click(screen.getByRole("button", { name: "Add colour" }));
    expect(save).toHaveBeenCalledWith("Oat Milk", null);
    view.unmount();
    render(<AddValueForm optionName="Paper Size" busy={false} save={save} />);
    expect(screen.queryByLabelText(/colour picker/i)).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "A4");
    await user.click(
      screen.getByRole("button", { name: "Add paper size value" }),
    );
    expect(save).toHaveBeenCalledWith("A4");
  });

  it("rejects case and whitespace duplicates and keeps server failures in the add dialog", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("The server could not save this colour."),
      );
    const close = vi.fn();
    const user = userEvent.setup();
    render(
      <ColourValueDialog
        mode="create"
        busy={false}
        existingNames={["Cognac"]}
        onClose={close}
        save={save}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Add colour" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(document.activeElement).toBe(name);
    await user.click(
      within(dialog).getByRole("button", { name: "Add colour" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Enter a colour name.",
    );
    await user.type(name, "  cOgNaC  ");
    await user.click(
      within(dialog).getByRole("button", { name: "Add colour" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "cOgNaC has already been added.",
    );
    expect(name.getAttribute("aria-describedby")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await user.clear(name);
    await user.type(name, "Terracotta");
    await user.click(
      within(dialog).getByRole("button", { name: "Add colour" }),
    );
    expect(
      await within(dialog).findByText("The server could not save this colour."),
    ).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("creates Colour values with individual swatches and edits a name and swatch in a separate form", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue(true);
    const view = render(<AddOptionForm busy={false} save={create} />);
    await user.type(
      screen.getByRole("textbox", { name: "Option name" }),
      "Color",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Colour name 1" }),
      "Forest Green",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Swatch for colour 1 hex",
        }) as HTMLInputElement
      ).value,
    ).toBe("#335438");
    await user.click(
      screen.getByRole("button", { name: "Add another colour" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Colour name 2" }),
      "Desert Clay",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Swatch for colour 2 hex",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    expect(create).toHaveBeenCalledWith("Color", [
      { value: "Forest Green", swatch_hex: "#335438" },
      { value: "Desert Clay", swatch_hex: null },
    ]);
    view.unmount();

    const update = vi.fn().mockResolvedValue(true);
    render(
      <ColourValueDialog
        mode="edit"
        initialName="Cognac"
        initialSwatch="#A65A32"
        existingNames={[]}
        busy={false}
        save={update}
        onClose={vi.fn()}
      />,
    );
    const hex = screen.getByRole("textbox", { name: "Swatch hex" });
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Burnt Cognac",
    );
    await user.clear(hex);
    await user.type(hex, "#b85a22");
    await user.click(screen.getByRole("button", { name: "Save colour" }));
    expect(update).toHaveBeenCalledWith("Burnt Cognac", "#B85A22");
  });
});

describe("simplified product editor", () => {
  const colourEditorProduct: Product = {
    ...product,
    status: "published",
    content_version: 1,
    options: [
      {
        id: "colour",
        name: "Colour",
        values: [
          { id: "forest", value: "Forest Green", swatch_hex: "#335438" },
          { id: "cognac", value: "Cognac", swatch_hex: "#A65A32" },
        ],
      },
    ],
    variants: [
      {
        ...product.variants[0],
        id: "green-variant",
        sku: "GREEN",
        option_value_ids: ["forest"],
      },
      {
        ...product.variants[1],
        id: "cognac-variant",
        sku: "COGNAC",
        option_value_ids: ["cognac"],
      },
    ],
  };
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

  it("keeps colour chips compact and edits name and swatch in a modal", async () => {
    let current = colourEditorProduct;
    mocks.api.mockImplementation(
      async (
        path: string,
        method = "GET",
        data?: { value?: string; swatch_hex?: string },
      ) => {
        if (path === "/products/p") return { data: current };
        if (path === "/tax-categories")
          return { data: [], development_only: false };
        if (path === "/options/colour/values/cognac" && method === "PATCH") {
          current = {
            ...current,
            content_version: 2,
            options: current.options.map((option) => ({
              ...option,
              values: option.values.map((value) =>
                value.id === "cognac"
                  ? {
                      ...value,
                      value: data?.value ?? value.value,
                      swatch_hex: data?.swatch_hex ?? null,
                    }
                  : value,
              ),
            })),
          };
          return { data: current };
        }
        if (path === "/options/colour/values" && method === "POST") {
          current = {
            ...current,
            content_version: 3,
            options: current.options.map((option) => ({
              ...option,
              values: [
                ...option.values,
                { id: "ivory", value: "Ivory", swatch_hex: "#F4EEE1" },
              ],
            })),
          };
          return { data: current };
        }
        return { data: product.categories, meta: { last_page: 1 } };
      },
    );
    const user = userEvent.setup();
    render(<AdminProductEditor id="p" />);
    await user.click(
      await screen.findByRole("tab", { name: "Pricing & Variants" }),
    );
    expect(document.querySelectorAll(".variant-value-chip")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /Edit swatch for/ }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Actions for Cognac" }),
    );
    await user.click(screen.getByRole("button", { name: "Edit colour" }));
    const dialog = screen.getByRole("dialog", { name: "Edit colour" });
    expect(document.querySelector(".admin-swatch-editor")).toBeNull();
    await user.clear(within(dialog).getByRole("textbox", { name: "Name" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Burnt Cognac",
    );
    await user.clear(
      within(dialog).getByRole("textbox", { name: "Swatch hex" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Swatch hex" }),
      "#B85A22",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save colour" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/options/colour/values/cognac",
        "PATCH",
        { value: "Burnt Cognac", swatch_hex: "#B85A22", content_version: 1 },
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Actions for Burnt Cognac" }),
    ).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "+ Add colour" });
    await user.click(trigger);
    const addDialog = screen.getByRole("dialog", { name: "Add colour" });
    expect(document.querySelector(".admin-colour-add-card")).toBeNull();
    expect(document.activeElement).toBe(
      within(addDialog).getByRole("textbox", { name: "Name" }),
    );
    await user.type(
      within(addDialog).getByRole("textbox", { name: "Name" }),
      "Ivory",
    );
    await user.click(
      within(addDialog).getByRole("button", { name: "Add colour" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/options/colour/values", "POST", {
        values: [{ value: "Ivory", swatch_hex: "#F4EEE1" }],
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Actions for Ivory" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add colour" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("closes Add colour with Escape and restores focus without expanding the page", async () => {
    const user = userEvent.setup();
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: colourEditorProduct }
        : path === "/tax-categories"
          ? { data: [], development_only: false }
          : { data: product.categories, meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await user.click(
      await screen.findByRole("tab", { name: "Pricing & Variants" }),
    );
    const trigger = screen.getByRole("button", { name: "+ Add colour" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Add colour" });
    expect(document.querySelector(".admin-colour-add-card")).toBeNull();
    expect(document.querySelector(".admin-colour-add-form")).toBeNull();
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add colour" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("adds a non-colour option value in a compact modal too", async () => {
    const user = userEvent.setup();
    const sized: Product = {
      ...colourEditorProduct,
      options: [
        { id: "size", name: "Size", values: [{ id: "small", value: "Small" }] },
      ],
    };
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: sized }
        : path === "/tax-categories"
          ? { data: [], development_only: false }
          : { data: product.categories, meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await user.click(
      await screen.findByRole("tab", { name: "Pricing & Variants" }),
    );
    await user.click(screen.getByRole("button", { name: "+ Add size" }));
    const dialog = screen.getByRole("dialog", { name: "Add size value" });
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toBe(
      document.activeElement,
    );
    expect(within(dialog).queryByLabelText(/swatch/i)).toBeNull();
    expect(document.querySelector(".admin-colour-add-card")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Add size value" })).toBeNull();
  });

  it("previews historical removal before removing a colour from sale", async () => {
    let current = colourEditorProduct;
    mocks.api.mockImplementation(async (path: string, method = "GET") => {
      if (path === "/products/p") return { data: current };
      if (path === "/tax-categories")
        return { data: [], development_only: false };
      if (path === "/options/colour/values/cognac/removal-preview")
        return {
          data: {
            allowed: true,
            mode: "archive",
            variant_count: 1,
            media_count: 1,
            variants: [{ sku: "COGNAC", status: "active" }],
            reason:
              "This colour has historical activity. Its variants will be removed from sale rather than permanently deleted.",
          },
        };
      if (path === "/options/colour/values/cognac" && method === "DELETE") {
        current = {
          ...current,
          content_version: 2,
          options: current.options.map((option) => ({
            ...option,
            values: option.values.map((value) =>
              value.id === "cognac" ? { ...value, removed: true } : value,
            ),
          })),
          variants: current.variants.map((variant) =>
            variant.id === "cognac-variant"
              ? { ...variant, status: "archived" }
              : variant,
          ),
        };
        return { data: current };
      }
      return { data: product.categories, meta: { last_page: 1 } };
    });
    const user = userEvent.setup();
    render(<AdminProductEditor id="p" />);
    await user.click(
      await screen.findByRole("tab", { name: "Pricing & Variants" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Cognac" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove colour" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Cognac?" });
    expect(within(dialog).getByText(/historical activity/)).toBeTruthy();
    expect(within(dialog).getByText(/COGNAC · Active/)).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/options/colour/values/cognac",
      "DELETE",
      expect.anything(),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Remove from sale" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/options/colour/values/cognac",
        "DELETE",
        { content_version: 1, reassign_variant_media: false },
      ),
    );
    expect(await screen.findByText(/Removed colour values \(1\)/)).toBeTruthy();
    expect(screen.getByText("COGNAC")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Actions for variant COGNAC" }),
    ).toBeNull();
    expect(screen.getByText("History retained")).toBeTruthy();
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
      if (path === "/options/material/values/linen/removal-preview")
        return {
          data: {
            allowed: true,
            mode: "delete",
            variant_count: 0,
            media_count: 0,
            reason: "This unused colour can be removed.",
          },
        };
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
      screen.getByRole("button", { name: "Actions for Linen" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove value" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Remove Linen?" })).getByRole(
        "button",
        { name: "Remove colour" },
      ),
    );
    expect(
      await screen.findByText(/2 combinations: 0 saved, 2 new variants/),
    ).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith(
      "/options/material/values/linen",
      "DELETE",
      { content_version: 1, reassign_variant_media: false },
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
      screen.getByRole("button", { name: "Actions for variant COTTON" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove from sale" }),
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
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for variant COTTON" }),
    );
    expect(
      screen.getByRole("button", { name: "Restore to sale" }),
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
    await userEvent.click(screen.getByRole("button", { name: "Make primary" }));
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
      screen.getByLabelText("Choose image"),
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
        undefined,
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
        (screen.getByLabelText("Choose image") as HTMLInputElement).files
          ?.length,
      ).toBe(0);
      expect(
        (screen.getByLabelText("Image description") as HTMLInputElement).value,
      ).toBe("");
      expect(screen.queryByAltText("Selected image preview")).toBeNull();
      expect(screen.queryByText("Selected file: product.png")).toBeNull();
    });
  });

  it("keeps the gallery above one labelled, compact upload workflow", async () => {
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    const gallery = document.querySelector(".media-gallery")!;
    const upload = document.querySelector("form#image-upload")!;
    expect(
      gallery.compareDocumentPosition(upload) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(upload.classList.contains("image-upload")).toBe(true);
    expect(
      within(upload as HTMLElement).getByText(
        "Drag image here or choose image",
      ),
    ).toBeTruthy();
    expect(
      within(upload as HTMLElement).getByLabelText("Choose image"),
    ).toBeTruthy();
    expect(
      within(upload as HTMLElement).getByRole("group", { name: "Applies to" }),
    ).toBeTruthy();
    expect(
      within(upload as HTMLElement).getByLabelText("Image description"),
    ).toBeTruthy();
    expect(screen.getByText("Primary image")).toBeTruthy();
  });

  it("hides variant controls when the product has no variants", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? { data: { ...product, variants: [], options: [] } }
        : path === "/tax-categories"
          ? { data: [], development_only: false }
          : { data: product.categories, meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    const upload = document.querySelector("form#image-upload")! as HTMLElement;
    expect(
      within(upload).queryByRole("group", { name: "Applies to" }),
    ).toBeNull();
    expect(within(upload).queryByLabelText("Variant")).toBeNull();
  });

  it("shows inline file and variant errors without sending an invalid upload", async () => {
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload image" }));
    expect(screen.getByText("Choose an image to upload.")).toBeTruthy();
    expect(screen.getByText("Describe the image.")).toBeTruthy();
    await userEvent.upload(
      screen.getByLabelText("Choose image"),
      new File(["bad"], "animation.gif", { type: "image/gif" }),
      { applyAccept: false },
    );
    expect(screen.getByText("Choose a JPEG, PNG or WebP image.")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Specific variant"));
    await userEvent.click(screen.getByRole("button", { name: "Upload image" }));
    expect(screen.getByText("Choose a variant.")).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uses a safe upload failure toast and keeps the selected file for retry", async () => {
    const error = vi.spyOn(toast, "error");
    mocks.upload.mockRejectedValueOnce(
      new Error("Internal storage path /private/example"),
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    await userEvent.upload(
      screen.getByLabelText("Choose image"),
      new File(["image"], "retry.png", { type: "image/png" }),
    );
    await userEvent.type(
      screen.getByLabelText("Image description"),
      "Woven textile",
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload image" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Image upload failed. Check the file and try again.",
      ),
    );
    expect(screen.getByText("Selected file: retry.png")).toBeTruthy();
    expect(screen.queryByText(/Internal storage path/)).toBeNull();
  });

  it("assigns existing media and uploads an image for a named variant", async () => {
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    expect(screen.getByText("Primary image")).toBeTruthy();
    expect(
      within(screen.getByText("Primary image").closest("article")!).getByText(
        "All variants",
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Image 1 actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Assign to variant" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Applies to variation"),
      "v1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save assignment" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/media/image", "PATCH", {
        variant_id: "v1",
      }),
    );
    await userEvent.click(screen.getByLabelText("Specific variant"));
    await userEvent.selectOptions(screen.getByLabelText("Variant"), "v2");
    await userEvent.upload(
      screen.getByLabelText("Choose image"),
      new File(["image"], "variant.png", { type: "image/png" }),
    );
    await userEvent.type(
      screen.getByLabelText("Image description"),
      "Linen textile",
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload image" }));
    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith(
        "p",
        expect.any(File),
        "Linen textile",
        "v2",
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("All variants") as HTMLInputElement).checked,
      ).toBe(true),
    );
    expect(screen.queryByLabelText("Variant")).toBeNull();
  });

  it("updates the image association badge after reassignment", async () => {
    let current = product;
    mocks.api.mockImplementation(
      async (path: string, method = "GET", data?: unknown) => {
        if (path === "/products/p") return { data: current };
        if (path === "/tax-categories")
          return { data: [], development_only: false };
        if (path === "/media/image" && method === "PATCH") {
          current = {
            ...current,
            media: current.media.map((image) => ({
              ...image,
              variant_id: (data as { variant_id: string | null }).variant_id,
            })),
          };
          return { data: current };
        }
        return { data: product.categories, meta: { last_page: 1 } };
      },
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Image 1 actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Assign to variant" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Applies to variation"),
      "v1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save assignment" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByText("Primary image").closest("article")!).getByText(
          "Cotton / Plain",
        ),
      ).toBeTruthy(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Image 1 actions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change to all variants" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByText("Primary image").closest("article")!).getByText(
          "All variants",
        ),
      ).toBeTruthy(),
    );
  });

  it("distinguishes the product primary from variant image ordering", async () => {
    const general = product.media[0];
    mocks.api.mockImplementation(async (path: string) =>
      path === "/products/p"
        ? {
            data: {
              ...product,
              media: [
                general,
                {
                  ...general,
                  id: "variant-first",
                  position: 1,
                  variant_id: "v1",
                },
                {
                  ...general,
                  id: "variant-second",
                  position: 2,
                  variant_id: "v1",
                },
              ],
            },
          }
        : path === "/tax-categories"
          ? { data: [], development_only: false }
          : { data: product.categories, meta: { last_page: 1 } },
    );
    render(<AdminProductEditor id="p" />);
    await screen.findByRole("tab", { name: "Images" });
    await userEvent.click(screen.getByRole("tab", { name: "Images" }));
    expect(screen.getAllByText("Primary image")).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Image 3 actions" }),
    );
    expect(
      screen.getByRole("button", { name: "Show first for variant" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Make primary" })).toBeNull();
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
  it("caps a simple SKU at its available quantity and announces the maximum", async () => {
    const user = userEvent.setup();
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
    expect(screen.getByText("In stock")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Quantity" });
    expect(group.textContent).toContain("Maximum 6 units");
    const plus = screen.getByRole("button", { name: "Increase quantity" });
    for (let count = 1; count < 6; count++) await user.click(plus);
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status", { name: "Quantity" }).textContent).toBe(
      "6",
    );
  });
  it("uses exact low stock and caps a selected variant while marking sold-out choices", async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        product={{
          ...product,
          variants: [
            {
              ...product.variants[0],
              available_quantity: 2,
              availability_status: "low_stock",
              low_stock: true,
            },
            product.variants[1],
            {
              ...product.variants[0],
              id: "sold-out",
              option_value_ids: ["cotton", "dyed"],
              available: false,
              available_quantity: 0,
              availability_status: "out_of_stock",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Choose options" }),
    ).toHaveProperty("disabled", true);
    const soldOut = screen.getByRole("button", { name: /Dyed.*Sold out/ });
    expect((soldOut as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cotton" }));
    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(screen.getByText("Only 2 left")).toBeTruthy();
    const plus = screen.getByRole("button", { name: "Increase quantity" });
    await user.click(plus);
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Linen" }));
    expect(screen.getByText("In stock")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Quantity" }).textContent).toBe(
      "1",
    );
  });
  it("refreshes stale product stock after a rejected add and clamps quantity", async () => {
    const user = userEvent.setup();
    const simple: Product = {
      ...product,
      kind: "simple",
      options: [],
      variants: [{ ...product.variants[0], option_value_ids: [] }],
    };
    mocks.cartAdd.mockResolvedValueOnce(null);
    const read = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          ...simple,
          variants: [
            {
              ...simple.variants[0],
              available_quantity: 2,
              availability_status: "low_stock",
              low_stock: true,
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", read);
    render(<ProductDetail product={simple} />);
    const plus = screen.getByRole("button", { name: "Increase quantity" });
    for (let count = 1; count < 4; count++) await user.click(plus);
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(await screen.findByText("Only 2 left")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Quantity" }).textContent).toBe(
      "2",
    );
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    expect(read).toHaveBeenCalledWith(
      "/api/v1/products/woven-textile",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
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
      screen.getByText("Choose your options to see availability."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cotton" }));
    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(screen.getByText("₦100.00")).toBeTruthy();
    expect(screen.queryByText("SKU: COTTON")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Linen" }));
    expect(screen.getByText("₦200.00")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Dyed.*Sold out/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("lets shoppers move between disjoint valid combinations without retaining an impossible selection", async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        product={{
          ...product,
          variants: [
            product.variants[0],
            { ...product.variants[1], option_value_ids: ["linen", "dyed"] },
          ],
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cotton" }));
    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(screen.getByText("₦100.00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Linen" }));
    expect(
      screen.getByText("Choose your options to see availability."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Plain" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "Dyed" }));
    expect(screen.getByText("₦200.00")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Add to cart" })
        .hasAttribute("disabled"),
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
    expect(screen.queryByText("SKU: COTTON")).toBeNull();
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
    expect(screen.getAllByText("Out of stock")).toHaveLength(2);
    expect(
      (
        screen.getByRole("button", {
          name: "Out of stock",
        }) as HTMLButtonElement
      ).disabled,
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
        screen.getByRole("button", {
          name: /Cotton.*Sold out/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Linen" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Linen" }));
    await user.click(screen.getByRole("button", { name: "Plain" }));
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
  it("keeps a mixed-stock product card available when at least one variant can be bought", () => {
    render(
      <ProductCard
        product={{
          ...product,
          available: true,
          variants: [
            { ...product.variants[0], available: false, available_quantity: 0 },
            product.variants[1],
          ],
        }}
      />,
    );
    expect(screen.queryByText("Out of stock")).toBeNull();
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
    await user.click(screen.getByRole("button", { name: "Linen" }));
    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(screen.getByText("₦200.00")).toBeTruthy();
    expect(screen.queryByText(/Ordering is not available/i)).toBeNull();
  });
  it("uses labelled colour swatches, variant media, low-stock status and general fallback", async () => {
    const user = userEvent.setup();
    const green = {
      id: "green",
      variant_id: "green-variant",
      alt_text: "Forest Green textile front",
      position: 1,
      width: 640,
      height: 480,
      sources: [{ url: "/green.webp", width: 640, height: 480 }],
    };
    const greenDetail = {
      ...green,
      id: "green-detail",
      alt_text: "Forest Green textile detail",
      position: 2,
      sources: [{ url: "/green-detail.webp", width: 640, height: 480 }],
    };
    const clay = {
      ...green,
      id: "clay",
      variant_id: "clay-variant",
      alt_text: "Terracotta textile",
      position: 3,
      sources: [{ url: "/clay.webp", width: 640, height: 480 }],
    };
    const colourProduct: Product = {
      ...product,
      options: [
        {
          id: "colour",
          name: "Colour",
          values: [
            { id: "forest", value: "Forest Green" },
            { id: "clay", value: "Terracotta" },
            { id: "cream", value: "Cream" },
          ],
        },
      ],
      variants: [
        {
          ...product.variants[0],
          id: "green-variant",
          option_value_ids: ["forest"],
          low_stock: true,
          available_quantity: 2,
          availability_status: "low_stock",
        },
        {
          ...product.variants[1],
          id: "clay-variant",
          option_value_ids: ["clay"],
        },
        {
          ...product.variants[1],
          id: "cream-variant",
          option_value_ids: ["cream"],
        },
      ],
      media: [product.media[0], green, greenDetail, clay],
    };
    render(<ProductDetail product={colourProduct} />);
    expect(document.querySelectorAll(".product-colour-swatch")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Forest Green" }));
    expect(screen.getByText("Only 2 left")).toBeTruthy();
    expect(
      screen.getByAltText("Forest Green textile front").getAttribute("src"),
    ).toBe("/green.webp");
    await user.click(screen.getByRole("button", { name: "View image 2 of 3" }));
    expect(
      screen.getByAltText("Forest Green textile detail").getAttribute("src"),
    ).toBe("/green-detail.webp");
    await user.click(screen.getByRole("button", { name: "Terracotta" }));
    expect(screen.getByAltText("Terracotta textile").getAttribute("src")).toBe(
      "/clay.webp",
    );
    await user.click(screen.getByRole("button", { name: "Cream" }));
    expect(
      screen.getByAltText("Woven textile folded").getAttribute("src"),
    ).toBe("/api/v1/media/image/640");
  });
  it("shows approved colour swatches with names and keeps unknown colours text-only", async () => {
    const user = userEvent.setup();
    const colours = ["Forest Green", "Cognac", "Ivory", "Black", "Taupe"];
    const colourProduct: Product = {
      ...product,
      options: [
        {
          id: "colour",
          name: "Colour",
          values: colours.map((value) => ({
            id: value,
            value,
            swatch_hex:
              (
                {
                  "Forest Green": "#335438",
                  Cognac: "#A65A32",
                  Ivory: "#F4EEE1",
                  Black: "#111111",
                } as Record<string, string>
              )[value] ?? null,
          })),
        },
      ],
      variants: colours.map((value, index) => ({
        ...product.variants[0],
        id: value,
        available: value !== "Taupe" && value !== "Black",
        available_quantity: value === "Taupe" || value === "Black" ? 0 : 6,
        availability_status:
          value === "Taupe" || value === "Black" ? "out_of_stock" : "in_stock",
        option_value_ids: [value],
        unit_price_minor: String(3900000 + index * 100000),
      })),
      media: colours.slice(0, 4).map((value, index) => ({
        id: value,
        variant_id: value,
        alt_text: `${value} bag`,
        position: index,
        width: 640,
        height: 480,
        sources: [
          {
            url: `/${value.toLowerCase().replaceAll(" ", "-")}.webp`,
            width: 640,
            height: 480,
          },
        ],
      })),
    };
    render(<ProductDetail product={colourProduct} />);

    for (const colour of colours.slice(0, 4)) {
      const button = screen.getByRole("button", {
        name: colour === "Black" ? /Black.*Sold out/ : colour,
      });
      expect(button.querySelector(".product-colour-swatch")).toBeTruthy();
      expect(button.getAttribute("aria-pressed")).toBe("false");
      if (colour === "Black")
        expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(
      (
        screen
          .getByRole("button", { name: "Ivory" })
          .querySelector(".product-colour-swatch") as HTMLElement
      ).style.backgroundColor,
    ).toBe("rgb(244, 238, 225)");
    const unknown = screen.getByRole("button", { name: /Taupe.*Sold out/ });
    expect(unknown.querySelector(".product-colour-swatch")).toBeNull();
    expect((unknown as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cognac" }));
    expect(screen.getByText("Colour — Cognac")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Cognac" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("₦40,000.00")).toBeTruthy();
    expect(screen.getByAltText("Cognac bag").getAttribute("src")).toBe(
      "/cognac.webp",
    );

    await user.click(screen.getByRole("button", { name: "Ivory" }));
    expect(screen.getByText("Colour — Ivory")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Cognac" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByAltText("Ivory bag").getAttribute("src")).toBe(
      "/ivory.webp",
    );
  });
  it("does not show another variant's image when the selected colour has no image", async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        product={{
          ...product,
          options: [
            {
              id: "colour",
              name: "Colour",
              values: [
                { id: "forest", value: "Forest Green" },
                { id: "black", value: "Black" },
              ],
            },
          ],
          variants: [
            { ...product.variants[0], option_value_ids: ["forest"] },
            { ...product.variants[1], option_value_ids: ["black"] },
          ],
          media: [{ ...product.media[0], variant_id: "v1" }],
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Black" }));
    expect(
      screen.getByRole("img", { name: "No product image available" }),
    ).toBeTruthy();
    expect(screen.queryByAltText("Woven textile folded")).toBeNull();
  });
  it("keeps colour choices as labelled chips when a palette has more than eight values", () => {
    const values = [
      "Forest Green",
      "Cognac",
      "Ivory",
      "Black",
      "Terracotta",
      "Cream",
      "Taupe",
      "Olive",
      "Sand",
    ];
    render(
      <ProductDetail
        product={{
          ...product,
          options: [
            {
              id: "colour",
              name: "Colour",
              values: values.map((value) => ({ id: value, value })),
            },
          ],
          variants: values.map((value) => ({
            ...product.variants[0],
            id: value,
            option_value_ids: [value],
          })),
        }}
      />,
    );
    expect(
      screen.queryByRole("combobox", { name: "Choose Colour" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Forest Green" })
        .querySelector(".product-colour-swatch"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Sand" })
        .querySelector(".product-colour-swatch"),
    ).toBeNull();
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
