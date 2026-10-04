import type { Product, Page } from "@/lib/catalog";
import { catalogFetch } from "@/lib/catalog-server";
import { selectRelated } from "@/lib/recommendations";
import { ProductCard } from "./product-card";

export async function RelatedProducts({ product }: { product: Product }) {
  let related: Product[] = [];
  try {
    const category = product.categories[0]?.slug;
    const categoryPage = category
      ? await catalogFetch<Page<Product>>(
          `/products?category=${encodeURIComponent(category)}&page_size=8`,
        )
      : { data: [] as Product[] };
    let candidates = categoryPage.data;
    if (selectRelated(product, candidates).length < 4) {
      const fallback = await catalogFetch<Page<Product>>(
        "/products?sort=newest&page_size=8",
      );
      candidates = [...candidates, ...fallback.data];
    }
    related = selectRelated(product, candidates);
  } catch {
    // Discovery is optional; never fail a purchase page for it.
    return null;
  }
  if (!related.length) return null;
  return (
    <section className="commerce-discovery" aria-labelledby="related-heading">
      <div className="commerce-discovery-heading">
        <p className="eyebrow">Explore more</p>
        <h2 id="related-heading">You may also like</h2>
      </div>
      <div className="catalog-grid">
        {related.map((item) => (
          <ProductCard key={item.slug} product={item} />
        ))}
      </div>
    </section>
  );
}
