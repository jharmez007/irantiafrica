"use client";
import { useState } from "react";
import Link from "next/link";
import {
  type Product,
  chooseOptionValue,
  resolveVariant,
  variantImageGallery,
} from "@/lib/catalog";
import { Badge, Breadcrumbs, Price } from "@/components/ui";
import { AddToCart } from "@/components/cart/add-to-cart";
import { ProductImage } from "./product-image";
import { ProductOptionSelector } from "./product-option-selector";
export function ProductDetail({ product }: { product: Product }) {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<string>();
  const [refreshed, setRefreshed] = useState<Product | null>(null);
  const currentProduct = refreshed?.slug === product.slug ? refreshed : product;
  const variant = resolveVariant(currentProduct, selection);
  const gallery = variantImageGallery(currentProduct, variant?.id);
  const activeImage =
    gallery.find((image) => image.id === selectedImage) ?? gallery[0];
  const unavailable = !currentProduct.available || variant?.available === false;
  const category = currentProduct.categories[0];
  async function refreshAvailability() {
    const response = await fetch(
      `/api/v1/products/${encodeURIComponent(product.slug)}`,
      {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (response.ok) {
      const body = (await response.json()) as { data: Product };
      setRefreshed(body.data);
    }
  }
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
            {currentProduct.categories.map((c, index) => (
              <Link key={c.slug} href={`/categories/${c.slug}`}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {c.name}
              </Link>
            ))}
          </p>
          <h1 className="product-heading">{currentProduct.name}</h1>
          <p className="catalog-price" aria-live="polite">
            <Price
              value={
                variant
                  ? variant.unit_price_minor
                  : currentProduct.price_min_minor
              }
              max={variant ? undefined : currentProduct.price_max_minor}
            />
          </p>
          {currentProduct.options.length > 0 && (
            <div className="product-options">
              {currentProduct.options.map((option) => (
                <ProductOptionSelector
                  key={option.id}
                  product={currentProduct}
                  option={option}
                  selection={selection}
                  onChange={(value) => {
                    setSelection((current) =>
                      chooseOptionValue(
                        currentProduct,
                        current,
                        option.id,
                        value,
                      ),
                    );
                    setSelectedImage(undefined);
                  }}
                />
              ))}
            </div>
          )}
          <div className="product-stock" role="status">
            {unavailable ? (
              <Badge tone="unavailable">Out of stock</Badge>
            ) : variant?.availability_status === "low_stock" ||
              variant?.low_stock ? (
              <Badge tone="warning">
                {variant.available_quantity !== undefined
                  ? `Only ${variant.available_quantity} left`
                  : "Low stock"}
              </Badge>
            ) : variant ? (
              <Badge tone="success">In stock</Badge>
            ) : (
              <span>Choose your options to see availability.</span>
            )}
          </div>
          <AddToCart
            key={variant?.id ?? "unselected"}
            variantId={variant?.id}
            available={!unavailable && !!variant}
            outOfStock={unavailable}
            availableQuantity={variant?.available_quantity}
            onAddFailure={refreshAvailability}
          />
          <div className="product-information">
            <details open>
              <summary>Product details</summary>
              <p className="catalog-description">
                {currentProduct.description}
              </p>
            </details>
            <details>
              <summary>Delivery &amp; checkout</summary>
              <p>
                Delivery and taxes are shown before you place your order.
                Payment follows order review.
              </p>
            </details>
          </div>
        </div>
      </article>
    </>
  );
}
