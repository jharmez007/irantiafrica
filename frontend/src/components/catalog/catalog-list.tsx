import Link from "next/link";
import { type Product, type Category, type Page } from "@/lib/catalog";
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Pagination,
  Select,
  Skeleton,
} from "@/components/ui";
import { ProductCard } from "./product-card";
export function CatalogList({
  result,
  categories,
  params,
  title = "Explore the collection",
  path = "/products",
  description,
}: {
  result: Page<Product>;
  categories: Category[];
  params: URLSearchParams;
  title?: string;
  path?: string;
  description?: string;
}) {
  function pageHref(page: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `${path}?${next}`;
  }
  const hasFilters = [...params.entries()].some(
    ([key, value]) => key !== "page" && key !== "sort" && value,
  );
  const search = params.get("q");
  return (
    <>
      <header className="catalog-intro">
        <p className="catalog-kicker">IRANTI Africa · The collection</p>
        <h1>{title}</h1>
        <p className="catalog-intro-copy">
          {description ??
            (path === "/search"
              ? "Find a piece by name, or explore a category."
              : path.startsWith("/categories/")
                ? "Explore the collection, one detail at a time."
                : "Browse the collection and find the pieces that speak to you.")}
        </p>
      </header>
      <div className="catalog-filter-panel">
        <form
          method="get"
          action={path.startsWith("/categories/") ? "/products" : path}
          className="catalog-filters"
        >
          <label>
            Search products
            <Input
              type="search"
              name="q"
              defaultValue={params.get("q") ?? ""}
              maxLength={100}
              placeholder="What are you looking for?"
            />
          </label>
          <label>
            Category
            <Select name="category" defaultValue={params.get("category") ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Sort
            <Select name="sort" defaultValue={params.get("sort") ?? "newest"}>
              <option value="newest">Newest</option>
              <option value="name">Name</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </Select>
          </label>
          {params.has("min_price") && (
            <input
              type="hidden"
              name="min_price"
              value={params.get("min_price")!}
            />
          )}
          {params.has("max_price") && (
            <input
              type="hidden"
              name="max_price"
              value={params.get("max_price")!}
            />
          )}
          <div className="catalog-filter-actions">
            <Button type="submit">Apply filters</Button>
            {hasFilters && <Link href="/products">Clear filters</Link>}
          </div>
        </form>
      </div>
      <div className="catalog-results-bar">
        <p role="status">
          {result.meta.total} {result.meta.total === 1 ? "piece" : "pieces"}
          {search ? ` for “${search}”` : " in the collection"}
        </p>
        <p>Prices in NGN</p>
      </div>
      {result.data.length === 0 ? (
        <EmptyState
          title="No products match these filters."
          description="Try another search or explore the full collection."
        >
          <Link href="/products" className="text-link">
            Explore all products
          </Link>
        </EmptyState>
      ) : (
        <div className="catalog-grid">
          {result.data.map((product, index) => (
            <ProductCard
              key={product.slug}
              product={product}
              heading="h2"
              priority={index < 2}
            />
          ))}
        </div>
      )}
      <Pagination
        page={result.meta.page}
        lastPage={Math.max(1, result.meta.last_page)}
        href={pageHref}
        label="Catalog pagination"
      />
    </>
  );
}
export function CatalogLoading() {
  return (
    <div className="catalog-loading" aria-busy="true">
      <p role="status">Loading the collection…</p>
      <div className="catalog-grid catalog-loading-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="product-card-skeleton" key={index}>
            <Skeleton className="product-card-media" />
            <Skeleton className="product-card-skeleton-title" />
            <Skeleton className="product-card-skeleton-price" />
          </div>
        ))}
      </div>
    </div>
  );
}
export function CatalogFailure({
  message = "We could not load the catalog. Please try again.",
}: {
  message?: string;
}) {
  return (
    <Alert tone="error" title="The collection is taking a moment">
      <p>{message}</p>
      <Link href="/products" className="text-link">
        Try again
      </Link>
    </Alert>
  );
}
