import { CatalogLoading } from "@/components/catalog/catalog-list";
import { CatalogShell } from "@/components/catalog/storefront";

export default function ProductsLoading() {
  return (
    <CatalogShell>
      <header className="catalog-intro">
        <p className="catalog-kicker">IRANTI Africa · The collection</p>
        <h1>Explore the collection</h1>
      </header>
      <CatalogLoading />
    </CatalogShell>
  );
}
