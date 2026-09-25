import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { Badge, Price } from "@/components/ui";
import { ProductImage } from "./product-image";

export function ProductCard({
  product,
  priority = false,
  heading = "h3",
}: {
  product: Product;
  priority?: boolean;
  heading?: "h2" | "h3";
}) {
  const Heading = heading;
  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className="product-card-link">
        <div className="product-card-media">
          <ProductImage
            image={product.media[0]}
            priority={priority}
            sizes="(max-width: 600px) calc(50vw - 23px), (max-width: 800px) calc(50vw - 36px), (max-width: 1100px) calc(33.34vw - 32px), (max-width: 1400px) calc(25vw - 38px), 312px"
          />
          {!product.available && <Badge tone="unavailable">Out of stock</Badge>}
        </div>
        <div className="product-card-body">
          {product.categories.length > 0 && (
            <p className="product-card-category">
              {product.categories.map((category) => category.name).join(" · ")}
            </p>
          )}
          <Heading className="product-card-title">{product.name}</Heading>
          <p className="product-card-price">
            <Price
              value={product.price_min_minor}
              max={product.price_max_minor}
            />
          </p>
        </div>
      </Link>
    </article>
  );
}
