"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button, Container, Input, Price } from "@/components/ui";
import { ProductImage } from "@/components/catalog/product-image";
import { useCart } from "./cart-provider";
import type { CartLine } from "@/lib/cart-api";
const stateText = {
  AVAILABLE: "Available now. Stock is confirmed again at checkout.",
  QUANTITY_REVIEW:
    "Stock changed. Your requested quantity has been kept; accept the suggested reduction or remove this item.",
  OUT_OF_STOCK: "Currently out of stock. Your item has been kept.",
  UNAVAILABLE:
    "This item is no longer offered. Remove it to resolve your cart.",
  AMOUNT_REVIEW:
    "This amount exceeds the supported limit. Reduce the quantity or remove this item.",
};
function Line({
  line,
  maximum,
  onRemoved,
}: {
  line: CartLine;
  maximum: number;
  onRemoved: () => void;
}) {
  const { update, remove, busy } = useCart();
  const [draft, setDraft] = useState({
    source: line.quantity,
    text: String(line.quantity),
  });
  const quantity =
    draft.source === line.quantity ? draft.text : String(line.quantity);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = Number(quantity);
    if (
      !/^\d+$/.test(quantity) ||
      !Number.isInteger(next) ||
      next < 1 ||
      next > maximum
    ) {
      setError(`Enter a whole number from 1 to ${maximum}.`);
      return;
    }
    setError("");
    await update(line.id, next);
  }
  const label = [line.name, ...line.options].join(" — ");
  return (
    <li className="cart-line">
      <div className="cart-line-image">
        <ProductImage image={line.image ?? undefined} sizes="128px" />
      </div>
      <div className="cart-line-content">
        <h2>
          {line.slug ? (
            <Link href={`/products/${line.slug}`}>{line.name}</Link>
          ) : (
            line.name
          )}
        </h2>
        {line.options.length > 0 && <p>{line.options.join(" · ")}</p>}
        <p>
          Each: <Price value={line.unit_price_minor} />
        </p>
        <p id={`state-${line.id}`} className="cart-line-state">
          {stateText[line.state]}
        </p>
        <form
          onSubmit={(event) => void submit(event)}
          className="cart-quantity-form"
        >
          <label htmlFor={`quantity-${line.id}`}>
            Quantity <span className="sr-only">for {label}</span>
          </label>
          <div className="cart-quantity-controls">
            <Button
              type="button"
              variant="secondary"
              aria-label={`Decrease quantity for ${label}`}
              disabled={
                busy ||
                line.quantity <= 1 ||
                line.state === "UNAVAILABLE" ||
                line.state === "OUT_OF_STOCK"
              }
              onClick={() => void update(line.id, line.quantity - 1)}
            >
              −
            </Button>
            <Input
              id={`quantity-${line.id}`}
              inputMode="numeric"
              value={quantity}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={`state-${line.id} quantity-error-${line.id} cart-error`}
              onChange={(e) =>
                setDraft({ source: line.quantity, text: e.target.value })
              }
            />
            <Button
              type="button"
              variant="secondary"
              aria-label={`Increase quantity for ${label}`}
              disabled={
                busy || line.quantity >= maximum || line.state !== "AVAILABLE"
              }
              onClick={() => void update(line.id, line.quantity + 1)}
            >
              +
            </Button>
            <Button variant="quiet" disabled={busy}>
              Update
            </Button>
          </div>
          <p
            id={`quantity-error-${line.id}`}
            role={error ? "alert" : undefined}
          >
            {error}
          </p>
        </form>
        {line.state === "QUANTITY_REVIEW" && (
          <Button
            disabled={busy}
            onClick={() => void update(line.id, line.suggested_quantity)}
          >
            Accept quantity {line.suggested_quantity} for {line.name}
          </Button>
        )}
        <Button
          variant="quiet"
          disabled={busy}
          aria-label={`Remove ${label}`}
          onClick={async () => {
            if (await remove(line.id)) onRemoved();
          }}
        >
          Remove
        </Button>
      </div>
      <p className="cart-line-total">
        <span>Line subtotal</span>
        <Price value={line.line_subtotal_minor} />
      </p>
    </li>
  );
}
export function CartPage() {
  const { cart, loading, busy, error, notice, refresh, clear } = useCart();
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <main id="main-content" className="cart-main">
      <Container>
        <p className="eyebrow">Your selection</p>
        <h1 tabIndex={-1} ref={heading}>
          Your cart
        </h1>
        <p>
          Current prices in NGN. Items are not reserved by adding them to your
          cart.
        </p>
        <div role="status" aria-live="polite">
          {loading ? "Loading your cart…" : notice}
        </div>
        <div id="cart-error" role={error ? "alert" : undefined}>
          {error && (
            <>
              <p>{error}</p>
              <Button onClick={() => void refresh()} disabled={busy}>
                Retry cart
              </Button>
            </>
          )}
        </div>
        {cart?.merge && (
          <p className="cart-notice" role="status">
            {cart.merge.message}
          </p>
        )}
        {cart && cart.items.length === 0 && (
          <section className="cart-empty">
            <h2>Your cart is empty</h2>
            <p>Explore the collection to begin your selection.</p>
            <Link className="button button--primary" href="/products">
              Explore the collection
            </Link>
          </section>
        )}
        {cart && cart.items.length > 0 && (
          <div className="cart-layout">
            <ul className="cart-lines" aria-label="Cart items">
              {cart.items.map((line) => (
                <Line
                  key={line.id}
                  line={line}
                  maximum={cart.limits.quantity}
                  onRemoved={() => heading.current?.focus()}
                />
              ))}
            </ul>
            <aside
              className="cart-summary"
              aria-labelledby="cart-summary-heading"
            >
              <h2 id="cart-summary-heading">Your selection</h2>
              <dl>
                <dt>
                  Subtotal{cart.needs_review ? " of available items" : ""}
                </dt>
                <dd>
                  <Price value={cart.subtotal_minor} />
                </dd>
              </dl>
              {cart.needs_review && (
                <p role="status">
                  Review the marked items. Unavailable or unresolved lines are
                  not included in this subtotal.
                </p>
              )}
              <p>
                Prices are checked each time your cart refreshes. Tax and
                delivery are calculated at checkout.
              </p>
              {cart.needs_review ? (
                <p>Resolve the marked items before checkout.</p>
              ) : (
                <Link className="button button--primary" href="/checkout">
                  Proceed to checkout
                </Link>
              )}
              <Button
                variant="quiet"
                disabled={busy}
                onClick={async () => {
                  if (await clear()) heading.current?.focus();
                }}
              >
                Clear cart
              </Button>
              <Link className="text-link" href="/products">
                Continue shopping
              </Link>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
