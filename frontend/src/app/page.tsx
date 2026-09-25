import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Container, SectionHeader, EmptyState } from "@/components/ui";
import { ProductCard } from "@/components/catalog/product-card";
import { CategoryCard } from "@/components/catalog/category-card";
import { catalogFetch } from "@/lib/catalog-server";
import type { Category, Page, Product } from "@/lib/catalog";
export default async function HomePage() {
  const [productsResult, categoriesResult] = await Promise.allSettled([
    catalogFetch<Page<Product>>("/products?page_size=4"),
    catalogFetch<Page<Category>>("/categories?page_size=4"),
  ]);
  const products =
    productsResult.status === "fulfilled" ? productsResult.value.data : [];
  const categories =
    categoriesResult.status === "fulfilled" ? categoriesResult.value.data : [];
  return (
    <main id="main-content">
      <section className="home-hero">
        <Container className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">IRANTI AFRICA</p>
            <h1>
              Memories
              <br />
              of <em>Nigeria.</em>
            </h1>
            <p className="hero-intro">A little closer to home.</p>
            <Link className="button button--primary" href="/products">
              Explore the collection <span aria-hidden="true">↗</span>
            </Link>
            <div className="hero-footnote">
              <span aria-hidden="true">01 /</span>
              <p>
                A place for the things
                <br />
                that stay with us.
              </p>
            </div>
          </div>
          <div className="hero-art">
            <Logo variant="primary" linked={false} />
            <span className="hero-art-caption">
              IRANTI AFRICA — MEMORIES OF NIGERIA
            </span>
          </div>
        </Container>
      </section>
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
              {categories.map((category, index) => (
                <CategoryCard
                  key={category.slug}
                  category={category}
                  index={index}
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
            <Link className="text-link" href="/products">
              Discover IRANTI <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </Container>
      </section>
    </main>
  );
}
