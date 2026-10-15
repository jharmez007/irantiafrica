import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { HomeHero } from "@/components/brand/home-hero";
import { Container, SectionHeader, EmptyState } from "@/components/ui";
import { ProductCard } from "@/components/catalog/product-card";
import { CategoryCard } from "@/components/catalog/category-card";
import { catalogFetch } from "@/lib/catalog-server";
import type { Category, Page, Product } from "@/lib/catalog";
import {
  HomeLoadingFallback,
  HomeSectionScroll,
} from "@/components/home-loading-fallback";
export default function HomePage() {
  return (
    <Suspense fallback={<HomeLoadingFallback />}>
      <HomeContent />
    </Suspense>
  );
}
async function HomeContent() {
  const [catalogResults] = await Promise.all([
    Promise.allSettled([
      catalogFetch<Page<Product>>("/products?page_size=4"),
      catalogFetch<Page<Category>>("/categories?page_size=4"),
    ]),
    // Temporary visual-test hold. Production never waits for this timer.
    process.env.NODE_ENV === "development"
      ? new Promise<void>((resolve) => setTimeout(resolve, 2000))
      : Promise.resolve(),
  ]);
  const [productsResult, categoriesResult] = catalogResults;
  const products =
    productsResult.status === "fulfilled" ? productsResult.value.data : [];
  const categories =
    categoriesResult.status === "fulfilled" ? categoriesResult.value.data : [];
  return (
    <main id="main-content">
      <HomeSectionScroll />
      <HomeHero />
      <section id="collections" className="home-section">
        <Container>
          <SectionHeader
            eyebrow="Discover IRANTI"
            title="Find your connection."
            description="Explore the collection, one detail at a time."
          >
            <Link className="text-link" href="/products">
              View all products <span aria-hidden="true">↗</span>
            </Link>
          </SectionHeader>
          {categories.length > 0 ? (
            <div className="category-grid">
              {categories.map((category) => (
                <CategoryCard
                  key={category.slug}
                  category={category}
                  image={
                    products.find((product) =>
                      product.categories.some(
                        (item) => item.slug === category.slug,
                      ),
                    )?.media[0]
                  }
                />
              ))}
            </div>
          ) : (
            <div className="collection-invitation">
              <p>The collection is taking shape.</p>
              <Link className="text-link" href="/products">
                Explore IRANTI ↗
              </Link>
            </div>
          )}
        </Container>
      </section>
      <section className="home-section home-products">
        <Container>
          <SectionHeader
            eyebrow="The collection"
            title="Something to remember."
          >
            <Link className="text-link" href="/products">
              Explore all <span aria-hidden="true">↗</span>
            </Link>
          </SectionHeader>
          {products.length > 0 ? (
            <div className="catalog-grid home-product-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.slug}
                  product={product}
                  heading="h3"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                productsResult.status === "rejected"
                  ? "The collection will be back soon."
                  : "A new collection awaits."
              }
              description={
                productsResult.status === "rejected"
                  ? "We couldn’t load the collection. Please try again shortly."
                  : "Explore IRANTI again soon to discover what’s new."
              }
            >
              <Link className="text-link" href="/products">
                Visit the collection ↗
              </Link>
            </EmptyState>
          )}
        </Container>
      </section>
      <section id="our-story" className="home-story">
        <Container className="story-grid">
          <div className="story-art">
            <Logo variant="secondary" linked={false} />
          </div>
          <div className="story-copy">
            <p className="eyebrow">Our story</p>
            <h2>
              Some things
              <br />
              stay with you.
            </h2>
            <p className="story-statement">
              A place. A feeling.
              <br />A memory of home.
            </p>
            <p>
              IRANTI Africa.
              <br />
              Memories of Nigeria.
            </p>
            <Link className="text-link" href="/our-story">
              Read our story <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </Container>
      </section>
    </main>
  );
}
