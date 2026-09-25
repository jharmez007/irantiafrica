import { ApiError } from "@/lib/auth-api";
import { notFound } from "next/navigation";
import { Storefront } from "@/components/catalog/storefront";
import { catalogFetch, catalogMetadata } from "@/lib/catalog-server";
import type { Category } from "@/lib/catalog";
export const dynamic = "force-dynamic";
async function category(slug: string) {
  try {
    return (
      await catalogFetch<{ data: Category }>(
        `/categories/${encodeURIComponent(slug)}`,
      )
    ).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const c = await category((await params).slug);
  const filtered = Object.values(await searchParams).some(Boolean);
  return {
    ...catalogMetadata(
      c.name,
      `Explore ${c.name} at IRANTI Africa.`,
      `/categories/${c.slug}`,
    ),
    robots: { index: !filtered, follow: true },
  };
}
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const c = await category((await params).slug);
  return (
    <Storefront
      searchParams={searchParams}
      category={c.slug}
      title={c.name}
      path={`/categories/${c.slug}`}
    />
  );
}
