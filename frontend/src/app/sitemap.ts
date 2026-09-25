import type { MetadataRoute } from "next";
import { catalogFetch, siteOrigin } from "@/lib/catalog-server";
import type { Page, Product, Category } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result: MetadataRoute.Sitemap = [
    { url: new URL("/products", siteOrigin).href },
  ];
  for (const kind of ["products", "categories"] as const) {
    let page = 1,
      last = 1;
    do {
      const data = await catalogFetch<Page<Product | Category>>(
        `/${kind}?page_size=100&page=${page}`,
      );
      last = data.meta.last_page;
      result.push(
        ...data.data.map((item) => ({
          url: new URL(`/${kind}/${item.slug}`, siteOrigin).href,
        })),
      );
      page++;
    } while (page <= last);
  }
  return result;
}
