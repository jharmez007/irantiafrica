"use client";
import { CatalogFailure } from "@/components/catalog/catalog-list";
import { Container } from "@/components/ui";

export default function ProductsError() {
  return (
    <main id="main-content" className="catalog-shell">
      <Container>
        <header className="catalog-intro">
          <p className="catalog-kicker">IRANTI Africa · The collection</p>
          <h1>Explore the collection</h1>
        </header>
        <CatalogFailure />
      </Container>
    </main>
  );
}
