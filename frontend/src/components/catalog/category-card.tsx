import Link from "next/link";
import type { CatalogImage, Category } from "@/lib/catalog";
import { ProductImage } from "./product-image";

export function CategoryCard({
  category,
  image,
  index = 0,
}: {
  category: Category;
  image?: CatalogImage;
  index?: number;
}) {
  return (
    <Link href={`/categories/${category.slug}`} className="category-card">
      <div className="category-card-visual">
        {image ? (
          <ProductImage
            image={image}
            sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 999px) 50vw, 33vw"
          />
        ) : (
          <span className="category-card-number" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="category-card-body">
        <h3>{category.name}</h3>
        <span aria-hidden="true">↗</span>
      </div>
    </Link>
  );
}
