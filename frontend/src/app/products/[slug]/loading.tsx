import { CatalogShell } from "@/components/catalog/storefront";
import { PageSkeleton } from "@/components/loading";

export default function ProductLoading() {
  return (
    <CatalogShell>
      <PageSkeleton kind="detail" label="Loading product details" />
    </CatalogShell>
  );
}
