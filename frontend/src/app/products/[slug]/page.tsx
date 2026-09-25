import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  catalogFetch,
  catalogMetadata,
  siteOrigin,
} from "@/lib/catalog-server";
import type { Product } from "@/lib/catalog";
import { ProductDetail } from "@/components/catalog/product-detail";
import { CatalogShell } from "@/components/catalog/storefront";
import { ApiError } from "@/lib/auth-api";
export const dynamic = "force-dynamic";
const product = cache(async (slug: string) => {
  try {
    return (
      await catalogFetch<{ data: Product }>(
        `/products/${encodeURIComponent(slug)}`,
      )
    ).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = await product((await params).slug);
  const meta = catalogMetadata(
    p.name,
    p.description.slice(0, 160),
    `/products/${p.slug}`,
  );
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      images: p.media[0]?.sources.at(-1)
        ? [new URL(p.media[0].sources.at(-1)!.url, siteOrigin).href]
        : [],
    },
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await product((await params).slug);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    url: new URL(`/products/${p.slug}`, siteOrigin).href,
    image: p.media.map((m) => new URL(m.sources.at(-1)!.url, siteOrigin).href),
  };
  return (
    <CatalogShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      <ProductDetail product={p} />
    </CatalogShell>
  );
}
