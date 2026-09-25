"use client";
import { useState } from "react";
import Link from "next/link";
import { type Product, resolveVariant, optionAvailable } from "@/lib/catalog";
import { Badge, Breadcrumbs, Price, Select } from "@/components/ui";
import { AddToCart } from "@/components/cart/add-to-cart";
import { ProductImage } from "./product-image";
export function ProductDetail({ product }: { product: Product }) {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<string>();
  const variant = resolveVariant(product, selection);
  const media = product.media.filter(
    (m) => !m.variant_id || m.variant_id === variant?.id,
  );
  const gallery = media.length ? media : product.media;
  const activeImage =
    gallery.find((image) => image.id === selectedImage) ?? gallery[0];
  const complete = product.options.every((o) => selection[o.id]);
  const unavailable = !product.available || variant?.available === false;
  const category = product.categories[0];
  return (
    <>
      <div className="product-breadcrumbs">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Shop", href: "/products" },
            ...(category
              ? [{ label: category.name, href: `/categories/${category.slug}` }]
              : []),
            { label: product.name },
          ]}
        />
      </div>
      <article className="product-detail">
        <div
          className="product-gallery"
          role="group"
          aria-label="Product gallery"
        >
          <div className="product-gallery-main">
            <ProductImage
              image={activeImage}
              priority
              sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 1100px) 52vw, (max-width: 1400px) 50vw, 658px"
            />
          </div>
          {gallery.length > 1 && (
            <div
              className="product-thumbnails"
              role="group"
              aria-label="Choose a product image"
            >
              {gallery.map((image, index) => (
                <button
                  type="button"
                  key={image.id}
                  className="product-thumbnail"
                  aria-label={`View image ${index + 1} of ${gallery.length}`}
                  aria-pressed={activeImage?.id === image.id}
                  onClick={() => setSelectedImage(image.id)}
                >
                  <ProductImage
                    image={{ ...image, alt_text: "" }}
                    sizes="88px"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-summary">
          <p className="product-categories">
            {product.categories.map((c, index) => (
              <Link key={c.slug} href={`/categories/${c.slug}`}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {c.name}
              </Link>
            ))}
          </p>
          <h1 className="product-heading">{product.name}</h1>
          <p className="catalog-price" aria-live="polite">
            <Price
              value={
                variant ? variant.unit_price_minor : product.price_min_minor
              }
              max={variant ? undefined : product.price_max_minor}
            />
          </p>
          <div className="product-stock" role="status">
            {unavailable ? (
              <Badge tone="unavailable">Out of stock</Badge>
            ) : variant ? (
              <Badge tone="success">In stock</Badge>
            ) : (
              <span>Select available options below.</span>
            )}
          </div>
          {product.options.length > 0 && (
            <div className="product-options">
              {product.options.map((option) => (
                <fieldset key={option.id} className="product-option">
                  <legend>{option.name}</legend>
                  <label className="sr-only" htmlFor={`option-${option.id}`}>
                    Choose {option.name}
                  </label>
                  <Select
                    id={`option-${option.id}`}
                    value={selection[option.id] ?? ""}
                    onChange={(e) =>
                      setSelection({
                        ...selection,
                        [option.id]: e.target.value,
                      })
                    }
                  >
                    <option value="">Choose {option.name}</option>
                    {option.values.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        disabled={
                          !optionAvailable(product, selection, option.id, v.id)
                        }
                      >
                        {v.value}
                        {!optionAvailable(product, selection, option.id, v.id)
                          ? " — unavailable"
                          : ""}
                      </option>
                    ))}
                  </Select>
                </fieldset>
              ))}
            </div>
          )}
          <p
            role="status"
            className={variant ? "product-reference" : "product-selection-note"}
          >
            {variant
              ? `SKU: ${variant.sku}`
              : complete
                ? "This combination is not offered in the catalog."
                : "Choose each option to see its price."}
          </p>
          <AddToCart
            variantId={variant?.id}
            available={!unavailable && !!variant}
          />
          <section
            className="product-description"
            aria-labelledby="product-description-heading"
          >
            <h2 id="product-description-heading">Product details</h2>
            <p className="catalog-description">{product.description}</p>
          </section>
          <p className="catalog-note">
            Prices in NGN. Tax is calculated separately.
          </p>
        </div>
      </article>
    </>
  );
}
