"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button, Drawer, Price } from "@/components/ui";
import { ProductImage } from "@/components/catalog/product-image";
import type { CartLine } from "@/lib/cart-api";
import { useCart } from "./cart-provider";
export function AddToCart({
  variantId,
  available,
}: {
  variantId?: string;
  available: boolean;
}) {
  const { add, busy, loading, cart, error, refresh } = useCart();
  const [added, setAdded] = useState<{
    line: CartLine;
    checkoutReady: boolean;
  } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  function closeCart() {
    setAdded(null);
    // The server response can arrive after the trigger loses focus. Restore it
    // after the native dialog has finished closing.
    setTimeout(() => addButton.current?.focus(), 0);
  }
  return (
    <div className="add-to-cart">
      <Button
        ref={addButton}
        disabled={!variantId || !available || busy || loading || !cart}
        onClick={async () => {
          if (!variantId) return;
          const updated = await add(variantId);
          const line = updated?.items.find(
            (item) => item.variant_id === variantId,
          );
          if (line) setAdded({ line, checkoutReady: !updated!.needs_review });
        }}
      >
        {busy ? "Updating cart…" : "Add to cart"}
      </Button>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button variant="quiet" onClick={() => void refresh()}>
            Refresh cart
          </Button>
        </div>
      )}
      <Drawer
        open={!!added}
        onClose={closeCart}
        title="Added to your bag"
        className="mini-cart-drawer"
      >
        {added && (
          <div className="mini-cart">
            <div className="mini-cart-line">
              <div className="mini-cart-image">
                <ProductImage
                  image={added.line.image ?? undefined}
                  sizes="96px"
                />
              </div>
              <div>
                <h3>{added.line.name}</h3>
                {added.line.options.length > 0 && (
                  <p>{added.line.options.join(" · ")}</p>
                )}
                <p>Quantity {added.line.quantity}</p>
                <p>
                  <Price value={added.line.line_subtotal_minor} />
                </p>
              </div>
            </div>
            <div className="mini-cart-actions">
              <Link
                href="/cart"
                className="button button--primary"
                onClick={closeCart}
              >
                View bag
              </Link>
              {added.checkoutReady && (
                <Link
                  href="/checkout"
                  className="button button--secondary"
                  onClick={closeCart}
                >
                  Checkout
                </Link>
              )}
              <Button variant="quiet" onClick={closeCart}>
                Continue shopping
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
