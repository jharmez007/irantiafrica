import { Storefront } from "@/components/catalog/storefront";
import { catalogMetadata } from "@/lib/catalog-server";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtered = Object.values(params).some(Boolean);
  return {
    ...catalogMetadata(
      "Shop the collection",
      "Explore the IRANTI Africa product collection.",
      "/products",
    ),
    robots: { index: !filtered, follow: true },
  };
}
export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Storefront searchParams={searchParams} />;
}
