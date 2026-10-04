import Image from "next/image";
import { Skeleton } from "@/components/ui";

export function InlineSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-loading" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function AppScreenLoader({
  label = "Preparing your experience…",
}: {
  label?: string;
}) {
  return (
    <div className="app-screen-loader" role="status" aria-busy="true">
      <div className="app-screen-loader-inner">
        <div className="app-screen-loader-mark" aria-hidden="true">
          <Image
            src="/assets/brand/favicon-original.png"
            width={96}
            height={96}
            alt=""
            priority
          />
        </div>
        <p className="app-screen-loader-name">IRANTI AFRICA</p>
        <p>{label}</p>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card-skeleton" aria-hidden="true">
      <Skeleton className="product-card-media" />
      <Skeleton className="product-card-skeleton-title" />
      <Skeleton className="product-card-skeleton-price" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="catalog-grid catalog-loading-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function TableSkeleton({
  columns = 5,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="loading-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div className="loading-table-row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="loading-panel" aria-hidden="true">
      <Skeleton className="loading-panel-title" />
      <Skeleton className="loading-panel-line" />
      <Skeleton className="loading-panel-line loading-panel-line--short" />
      <Skeleton className="loading-panel-field" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="loading-detail" aria-hidden="true">
      <Skeleton className="loading-detail-image" />
      <PanelSkeleton />
    </div>
  );
}

type PageKind =
  | "home"
  | "catalog"
  | "detail"
  | "cart"
  | "checkout"
  | "account"
  | "auth"
  | "admin-table"
  | "admin-editor"
  | "admin-dashboard";

export function PageSkeleton({
  kind,
  label,
  showHeading = true,
}: {
  kind: PageKind;
  label: string;
  showHeading?: boolean;
}) {
  const admin = kind.startsWith("admin-");
  return (
    <div
      className={`page-skeleton page-skeleton--${kind}${admin ? " page-skeleton--admin" : ""}`}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {showHeading && (
        <div aria-hidden="true" className="page-skeleton-heading">
          <Skeleton className="page-skeleton-kicker" />
          <Skeleton className="page-skeleton-title" />
        </div>
      )}
      {kind === "home" ? (
        <>
          <DetailSkeleton />
          <ProductGridSkeleton count={4} />
        </>
      ) : kind === "catalog" ? (
        <>
          <PanelSkeleton />
          <ProductGridSkeleton />
        </>
      ) : kind === "detail" ? (
        <DetailSkeleton />
      ) : kind === "admin-table" ? (
        <TableSkeleton />
      ) : kind === "admin-dashboard" ? (
        <>
          <div className="loading-metrics" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <PanelSkeleton key={index} />
            ))}
          </div>
          <TableSkeleton />
        </>
      ) : kind === "admin-editor" || kind === "checkout" ? (
        <>
          <PanelSkeleton />
          <PanelSkeleton />
        </>
      ) : kind === "cart" ? (
        <>
          <div className="loading-cart-line" aria-hidden="true">
            <Skeleton className="loading-cart-image" />
            <PanelSkeleton />
          </div>
          <PanelSkeleton />
        </>
      ) : (
        <PanelSkeleton />
      )}
    </div>
  );
}
