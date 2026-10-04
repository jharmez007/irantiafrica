import Link from "next/link";
import Image from "next/image";
import type { CatalogImage, Category } from "@/lib/catalog";
import { categoryImagery } from "@/lib/category-imagery";
import { ProductImage } from "./product-image";

export function CategoryCard({
  category,
  image,
}: {
  category: Category;
  image?: CatalogImage;
}) {
  const artwork = categoryImagery[category.slug];
  return (
    <Link href={`/categories/${category.slug}`} className="category-card">
      <div className="category-card-visual">
        {artwork ? (
          <Image
            src={artwork.src}
            alt={artwork.alt}
            width={artwork.width}
            height={artwork.height}
            sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 999px) 50vw, 25vw"
          />
        ) : image ? (
          <ProductImage
            image={image}
            sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 999px) 50vw, 33vw"
          />
        ) : (
          <span className="category-card-fallback" aria-hidden="true" />
        )}
      </div>
      <div className="category-card-body">
        <h3>{category.name}</h3>
        <span aria-hidden="true">↗</span>
      </div>
    </Link>
  );
}
