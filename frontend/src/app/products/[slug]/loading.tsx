import { CatalogShell } from "@/components/catalog/storefront";
import { Skeleton } from "@/components/ui";

export default function ProductLoading() {
  return (
    <CatalogShell>
      <p role="status">Loading product details…</p>
      <div className="product-detail" aria-busy="true" aria-hidden="true">
        <Skeleton className="product-gallery-main" />
        <div className="product-summary">
          <Skeleton className="product-card-skeleton-title" />
          <Skeleton className="product-card-skeleton-price" />
          <Skeleton className="product-description-skeleton" />
        </div>
      </div>
    </CatalogShell>
  );
}
