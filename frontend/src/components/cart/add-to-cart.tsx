"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useCart } from "./cart-provider";
export function AddToCart({
  variantId,
  available,
}: {
  variantId?: string;
  available: boolean;
}) {
  const { add, busy, loading, cart, error, refresh } = useCart();
  const [added, setAdded] = useState(false);
  return (
    <div className="add-to-cart">
      <Button
        disabled={!variantId || !available || busy || loading || !cart}
        onClick={async () => {
          if (variantId) setAdded(await add(variantId));
        }}
      >
        {busy ? "Updating cart…" : "Add to cart"}
      </Button>
      {added && (
        <p role="status">
          Added to your cart.{" "}
          <Link className="text-link" href="/cart">
            View cart
          </Link>
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button variant="quiet" onClick={() => void refresh()}>
            Refresh cart
          </Button>
        </div>
      )}
    </div>
  );
}
