"use client";
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
  return (
    <div className="add-to-cart">
      <Button
        disabled={!variantId || !available || busy || loading || !cart}
        onClick={async () => {
          if (variantId) await add(variantId);
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
    </div>
  );
}
