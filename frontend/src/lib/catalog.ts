export type Category = {
  id?: string;
  name: string;
  slug: string;
  status?: string;
  parent_id?: string | null;
};
export type CatalogImage = {
  id: string;
  variant_id: string | null;
  alt_text: string;
  position: number;
  width: number | null;
  height: number | null;
  status?: string;
  sources: { url: string; width: number; height: number }[];
};
export type Variant = {
  id: string;
  available: boolean;
  sku: string;
  unit_price_minor: string;
  currency: "NGN";
  option_value_ids: string[];
  status?: string;
  price_version?: number;
};
export type Product = {
  id?: string;
  available: boolean;
  slug: string;
  name: string;
  description: string;
  kind: "simple" | "variant";
  currency: "NGN";
  price_min_minor: string | null;
  price_max_minor: string | null;
  categories: Category[];
  category_ids?: string[];
  options: {
    id: string;
    name: string;
    values: { id: string; value: string }[];
  }[];
  variants: Variant[];
  media: CatalogImage[];
  status?: string;
  content_version?: number;
  tax_category_code?: string;
};
export type Page<T> = {
  data: T[];
  meta: { page: number; last_page: number; total: number; page_size?: number };
};
export function money(minor: string | null): string {
  if (minor === null) return "Price pending";
  const value = BigInt(minor);
  return `₦${(value / 100n).toLocaleString("en-NG")}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function priceRange(product: Product): string {
  return product.price_min_minor === product.price_max_minor
    ? money(product.price_min_minor)
    : `${money(product.price_min_minor)} – ${money(product.price_max_minor)}`;
}
export function resolveVariant(
  product: Product,
  selection: Record<string, string>,
): Variant | undefined {
  if (product.kind === "simple")
    return product.variants.find((v) => v.status !== "archived");
  const ids = product.options.map((option) => selection[option.id]);
  if (ids.some((id) => !id)) return undefined;
  return product.variants.find(
    (v) =>
      v.status !== "archived" &&
      v.option_value_ids.length === ids.length &&
      ids.every((id) => v.option_value_ids.includes(id)),
  );
}
export function canManageCatalog(roles: string[] = []): boolean {
  return roles.includes("owner");
}
export function optionAvailable(
  product: Product,
  selection: Record<string, string>,
  optionId: string,
  valueId: string,
): boolean {
  const candidate = { ...selection, [optionId]: valueId };
  return product.variants.some(
    (variant) =>
      variant.status !== "archived" &&
      variant.available === true &&
      Object.values(candidate)
        .filter(Boolean)
        .every((id) => variant.option_value_ids.includes(id)),
  );
}
export function catalogParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of [
    "q",
    "category",
    "sort",
    "page",
    "min_price",
    "max_price",
  ]) {
    const value = input[key];
    if (typeof value === "string" && value) result.set(key, value);
  }
  return result;
}
