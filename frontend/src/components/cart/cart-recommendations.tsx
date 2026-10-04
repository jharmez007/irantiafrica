"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product, Page } from "@/lib/catalog";
import type { CartLine } from "@/lib/cart-api";
import { selectRelated } from "@/lib/recommendations";
import { ProductCard } from "@/components/catalog/product-card";

async function publicData<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Discovery unavailable");
  return response.json() as Promise<T>;
}

export function CartRecommendations({ lines }: { lines: CartLine[] }) {
  const firstSlug = lines.find((line) => line.slug)?.slug;
  const excluded = useMemo(
    () =>
      lines.map((line) => line.slug).filter((slug): slug is string => !!slug),
    [lines],
  );
  const excludedKey = excluded.join("|");
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    if (!firstSlug) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { data: source } = await publicData<{ data: Product }>(
          `/products/${encodeURIComponent(firstSlug!)}`,
          controller.signal,
        );
        const category = source.categories[0]?.slug;
        const categoryPage = category
          ? await publicData<Page<Product>>(
              `/products?category=${encodeURIComponent(category)}&page_size=8`,
              controller.signal,
            )
          : { data: [] as Product[] };
        let candidates = categoryPage.data;
        const omitted = new Set(excludedKey.split("|").filter(Boolean));
        if (selectRelated(source, candidates, omitted, 4).length < 4) {
          const fallback = await publicData<Page<Product>>(
            "/products?sort=newest&page_size=8",
            controller.signal,
          );
          candidates = [...candidates, ...fallback.data];
        }
        if (!controller.signal.aborted)
          setProducts(selectRelated(source, candidates, omitted, 4));
      } catch {
        if (!controller.signal.aborted) setProducts([]);
      }
    }
    void load();
    return () => controller.abort();
  }, [firstSlug, excludedKey]);
  // Hide a newly added cart product immediately, even before discovery refetches.
  const visible = products.filter(
    (product) => !excluded.includes(product.slug),
  );
  if (!visible.length) return null;
  return (
    <section
      className="commerce-discovery"
      aria-labelledby="cart-discovery-heading"
    >
      <div className="commerce-discovery-heading">
        <p className="eyebrow">A little more to explore</p>
        <h2 id="cart-discovery-heading">Pairs well with your selection</h2>
      </div>
      <div className="catalog-grid">
        {visible.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}
