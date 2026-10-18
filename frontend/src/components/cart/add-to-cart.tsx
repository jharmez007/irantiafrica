"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Price } from "@/components/ui";
import { ProductImage } from "@/components/catalog/product-image";
import type { CartLine } from "@/lib/cart-api";
import { useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";

function MiniCartLine({
  line,
  maximum,
  justAdded,
  onNavigate,
  onRemoved,
}: {
  line: CartLine;
  maximum: number;
  justAdded: boolean;
  onNavigate: () => void;
  onRemoved: () => void;
}) {
  const { update, remove, busy } = useCart();
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const pendingLock = useRef(false);
  const lineMaximum = Math.min(maximum, line.available_quantity);
  const pending = pendingQuantity !== null;
  const controlsDisabled =
    busy ||
    pending ||
    line.state === "UNAVAILABLE" ||
    line.state === "OUT_OF_STOCK" ||
    line.state === "QUANTITY_REVIEW";

  async function changeQuantity(next: number) {
    if (pendingLock.current || busy || next < 1 || next > lineMaximum) return;
    pendingLock.current = true;
    setPendingQuantity(next);
    try {
      await update(line.id, next);
    } finally {
      pendingLock.current = false;
      setPendingQuantity(null);
    }
  }

  return (
    <li
      className={`mini-cart-line${justAdded ? " mini-cart-line--added" : ""}`}
    >
      <div className="mini-cart-image">
        <ProductImage image={line.image ?? undefined} sizes="80px" />
      </div>
      <div className="mini-cart-line-content">
        {justAdded && <span className="mini-cart-added-label">Just added</span>}
        <h3>
          {line.slug ? (
            <Link href={`/products/${line.slug}`} onClick={onNavigate}>
              {line.name}
            </Link>
          ) : (
            line.name
          )}
        </h3>
        {line.options.length > 0 && (
          <p className="mini-cart-options">{line.options.join(" · ")}</p>
        )}
        <p className="mini-cart-unit-price">
          <Price value={line.unit_price_minor} /> each
        </p>
        {line.state !== "AVAILABLE" && (
          <p className="mini-cart-line-state" role="status">
            {line.state === "QUANTITY_REVIEW"
              ? `Only ${line.available_quantity} available. Review this item in your bag.`
              : line.state === "OUT_OF_STOCK"
                ? "Currently out of stock. This item remains in your bag."
                : line.state === "UNAVAILABLE"
                  ? "No longer available. Remove this item to continue."
                  : "Review this amount in your bag before checkout."}
          </p>
        )}
        <div className="mini-cart-line-tools">
          <QuantityStepper
            value={pendingQuantity ?? line.quantity}
            max={lineMaximum}
            label={`Quantity for ${line.name}`}
            disabled={controlsDisabled}
            pending={pending}
            onChange={(next) => void changeQuantity(next)}
          />
          <span className="mini-cart-line-total">
            <span className="sr-only">Line total: </span>
            <Price value={line.line_subtotal_minor} />
          </span>
        </div>
        <div className="mini-cart-line-footer">
          <span role="status">{pending ? "Updating…" : ""}</span>
          <button
            type="button"
            className="mini-cart-remove"
            disabled={busy || pending}
            aria-label={`Remove ${line.name} from bag`}
            onClick={async () => {
              if (await remove(line.id)) onRemoved();
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function AddToCart({
  variantId,
  available,
  outOfStock = false,
  availableQuantity,
  onAddFailure,
}: {
  variantId?: string;
  available: boolean;
  outOfStock?: boolean;
  availableQuantity?: number;
  onAddFailure?: () => Promise<void>;
}) {
  const { add, busy, loading, cart, error, notice, refresh } = useCart();
  const [added, setAdded] = useState<{ lineId: string | null } | null>(null);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [quantity, setQuantity] = useState(1);
  const inCart =
    cart?.items?.find((item) => item.variant_id === variantId)?.quantity ?? 0;
  const max = Math.max(
    0,
    Math.min(
      (cart?.limits?.quantity ?? 99) - inCart,
      availableQuantity === undefined ? Infinity : availableQuantity - inCart,
    ),
  );
  const selectedQuantity = Math.min(quantity, Math.max(1, max));
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const listElement = list.current;
    const row = added?.lineId
      ? listElement?.querySelector(".mini-cart-line--added")
      : null;
    if (!listElement || !row) return;
    const rowBox = row.getBoundingClientRect();
    const listBox = listElement.getBoundingClientRect();
    listElement.scrollTop +=
      rowBox.top - listBox.top - (listBox.height - rowBox.height) / 2;
  }, [added?.lineId]);
  function closeCart() {
    setAdded(null);
  }
  return (
    <div className="add-to-cart">
      <QuantityStepper
        value={selectedQuantity}
        max={max}
        label="Quantity"
        disabled={!available || max < 1 || busy || loading || !cart}
        onChange={setQuantity}
      />
      <Button
        ref={addButton}
        disabled={
          !variantId || !available || max < 1 || busy || loading || !cart
        }
        onClick={async () => {
          if (!variantId) return;
          setTrigger(addButton.current);
          const updated = await add(variantId, selectedQuantity);
          if (!updated) {
            try {
              await onAddFailure?.();
            } catch {
              // The cart error remains visible if the product read also fails.
            }
            return;
          }
          const line = updated.items.find(
            (item) => item.variant_id === variantId,
          );
          setAdded({ lineId: line?.id ?? null });
        }}
      >
        {busy
          ? "Adding…"
          : outOfStock
            ? "Out of stock"
            : !variantId
              ? "Choose options"
              : max < 1
                ? "Maximum in cart"
                : "Add to cart"}
      </Button>
      {available && max < 1 && (
        <p className="add-to-cart-limit" role="status">
          You have the maximum available quantity in your cart.
        </p>
      )}
      {error && !added && (
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
        returnFocusTo={trigger}
        title={`My bag (${cart?.item_count ?? 0})`}
        className="mini-cart-drawer"
      >
        {added && (
          <div className="mini-cart">
            {cart && cart.items.length > 0 ? (
              <>
                {added.lineId &&
                  cart.items.some((line) => line.id === added.lineId) && (
                    <p className="mini-cart-confirmation" role="status">
                      Added to your bag
                    </p>
                  )}
                {error && (
                  <div className="mini-cart-feedback" role="alert">
                    <p>{error}</p>
                    <Button variant="quiet" onClick={() => void refresh()}>
                      Refresh bag
                    </Button>
                  </div>
                )}
                {notice && (
                  <p className="mini-cart-feedback" role="status">
                    {notice}
                  </p>
                )}
                {cart.merge && (
                  <p className="mini-cart-feedback" role="status">
                    {cart.merge.message}
                  </p>
                )}
                <ul
                  ref={list}
                  className="mini-cart-list"
                  aria-label="Items in your bag"
                >
                  {cart.items.map((line) => (
                    <MiniCartLine
                      key={line.id}
                      line={line}
                      maximum={cart.limits.quantity}
                      justAdded={line.id === added.lineId}
                      onNavigate={closeCart}
                      onRemoved={() => {
                        if (line.id === added.lineId)
                          setAdded({ lineId: null });
                      }}
                    />
                  ))}
                </ul>
                <div className="mini-cart-summary">
                  <div className="mini-cart-subtotal">
                    <span>
                      Subtotal{cart.needs_review ? " of available items" : ""}
                    </span>
                    <strong>
                      <Price value={cart.subtotal_minor} />
                    </strong>
                  </div>
                  <p>
                    Delivery and any applicable charges are calculated at
                    checkout.
                  </p>
                  {cart.needs_review && (
                    <p className="mini-cart-review" role="status">
                      Review the marked items in your bag before checkout.
                    </p>
                  )}
                  <div className="mini-cart-actions">
                    {!cart.needs_review && (
                      <Link
                        href="/checkout?from=cart"
                        className="button button--primary"
                        onClick={closeCart}
                      >
                        Checkout
                      </Link>
                    )}
                    <Link
                      href="/cart"
                      className={
                        cart.needs_review
                          ? "button button--primary"
                          : "button button--secondary"
                      }
                      onClick={closeCart}
                    >
                      View bag
                    </Link>
                    <Button variant="quiet" onClick={closeCart}>
                      Continue shopping
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="mini-cart-empty">
                <h3>Your bag is empty</h3>
                <p>Explore the collection to find something you love.</p>
                <Link
                  href="/products"
                  className="button button--primary"
                  onClick={closeCart}
                >
                  Explore the collection
                </Link>
                <Button variant="quiet" onClick={closeCart}>
                  Continue shopping
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
