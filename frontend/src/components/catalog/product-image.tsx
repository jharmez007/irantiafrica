import type { CatalogImage } from "@/lib/catalog";
export function ProductImage({
  image,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw",
}: {
  image?: CatalogImage;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image?.sources.length)
    return (
      <div
        className="catalog-placeholder"
        role="img"
        aria-label="No product image available"
      >
        <span>Image unavailable</span>
      </div>
    );
  const sources = Array.from(
    new Map(image.sources.map((source) => [source.width, source])).values(),
  ).sort((a, b) => a.width - b.width);
  const source = sources.at(-1)!;
  // Derivatives are already bounded and optimized by the backend; no arbitrary image proxy.
  return (
    <picture className="product-picture">
      <source
        type="image/webp"
        srcSet={sources.map((s) => `${s.url} ${s.width}w`).join(", ")}
        sizes={sizes}
      />
      <img
        src={source.url}
        alt={image.alt_text}
        width={source.width}
        height={source.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        className="catalog-image"
      />
    </picture>
  );
}
