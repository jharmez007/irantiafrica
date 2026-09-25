import { Container } from "@/components/ui";
import { catalogFetch } from "@/lib/catalog-server";
import {
  catalogParams,
  type Product,
  type Page,
  type Category,
} from "@/lib/catalog";
import { CatalogList, CatalogFailure } from "./catalog-list";
import { ApiError } from "@/lib/auth-api";
async function allCategories(): Promise<Category[]> {
  const categories: Category[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const result = await catalogFetch<Page<Category>>(
      `/categories?page_size=100&page=${page}`,
    );
    categories.push(...result.data);
    lastPage = result.meta.last_page;
    page++;
  } while (page <= lastPage);
  return categories;
}
export function CatalogShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="catalog-shell">
      <Container>{children}</Container>
    </main>
  );
}
export async function Storefront({
  searchParams,
  category,
  title,
  path = "/products",
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  category?: string;
  title?: string;
  path?: string;
}) {
  const params = catalogParams(await searchParams);
  if (category) params.set("category", category);
  let loaded: [Page<Product>, Category[]] | undefined;
  let failure: string | undefined;
  try {
    loaded = await Promise.all([
      catalogFetch<Page<Product>>(`/products?${params}`),
      allCategories(),
    ]);
  } catch (error) {
    failure =
      error instanceof ApiError
        ? error.message
        : "The catalog is temporarily unavailable.";
  }
  return (
    <CatalogShell>
      {loaded ? (
        <CatalogList
          result={loaded[0]}
          categories={loaded[1]}
          params={params}
          title={title}
          path={path}
        />
      ) : (
        <>
          <header className="catalog-intro">
            <p className="catalog-kicker">IRANTI Africa · The collection</p>
            <h1>{title ?? "Explore the collection"}</h1>
          </header>
          <CatalogFailure message={failure} />
        </>
      )}
    </CatalogShell>
  );
}
