import { Storefront } from "@/components/catalog/storefront";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};
export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Storefront
      searchParams={searchParams}
      title="Search the collection"
      path="/search"
    />
  );
}
