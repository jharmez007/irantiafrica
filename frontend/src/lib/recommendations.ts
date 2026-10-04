import type { Product } from "./catalog";

/** Public, deterministic merchandising only. No browsing history or identity data. */
export function selectRelated(
  source: Pick<Product, "slug" | "categories" | "price_min_minor">,
  candidates: Product[],
  excluded: ReadonlySet<string> = new Set(),
  limit = 4,
): Product[] {
  const categories = new Set(
    source.categories.map((category) => category.slug),
  );
  const sourcePrice = source.price_min_minor
    ? BigInt(source.price_min_minor)
    : null;
  const unique = new Map<string, Product>();
  for (const candidate of candidates) {
    if (
      candidate.slug === source.slug ||
      excluded.has(candidate.slug) ||
      !candidate.available ||
      (candidate.status && candidate.status !== "published")
    )
      continue;
    unique.set(candidate.slug, candidate);
  }
  return [...unique.values()]
    .sort((a, b) => {
      const aCategory = a.categories.some((category) =>
        categories.has(category.slug),
      );
      const bCategory = b.categories.some((category) =>
        categories.has(category.slug),
      );
      if (aCategory !== bCategory) return aCategory ? -1 : 1;
      if (sourcePrice !== null) {
        const distance = (product: Product) =>
          product.price_min_minor === null
            ? null
            : BigInt(product.price_min_minor) > sourcePrice
              ? BigInt(product.price_min_minor) - sourcePrice
              : sourcePrice - BigInt(product.price_min_minor);
        const aDistance = distance(a);
        const bDistance = distance(b);
        if (aDistance !== null && bDistance !== null) {
          if (aDistance < bDistance) return -1;
          if (aDistance > bDistance) return 1;
        }
      }
      return a.slug.localeCompare(b.slug);
    })
    .slice(0, limit);
}
