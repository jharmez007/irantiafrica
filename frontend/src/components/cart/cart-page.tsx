"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Container, Modal, Price } from "@/components/ui";
import { ProductImage } from "@/components/catalog/product-image";
import { PageSkeleton } from "@/components/loading";
import { useCart } from "./cart-provider";
import type { CartData, CartLine } from "@/lib/cart-api";
import { useAuth } from "@/components/auth-provider";
import { orderRequest } from "@/lib/order-api";
import { CartRecommendations } from "./cart-recommendations";
import { QuantityStepper } from "./quantity-stepper";
import { CartRecovery } from "./cart-recovery";
const stateText = {
  AVAILABLE: "",
  QUANTITY_REVIEW: "",
  OUT_OF_STOCK: "Out of stock.",
  UNAVAILABLE: "No longer available.",
  AMOUNT_REVIEW: "Reduce the quantity or remove this item.",
};
const heldByExistingOrder = (line: CartLine) =>
  (line.held_by_order_quantity ?? 0) > 0 &&
  line.quantity <= line.available_quantity + (line.held_by_order_quantity ?? 0);
const reviewText = (line: CartLine) =>
  heldByExistingOrder(line)
    ? "part of your unfinished order"
    : line.state === "OUT_OF_STOCK"
      ? "out of stock for a new checkout"
      : line.state === "QUANTITY_REVIEW"
        ? `only ${line.available_quantity} available for a new checkout`
        : line.state === "UNAVAILABLE"
          ? "unavailable"
          : "amount needs review";
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
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const pendingLock = useRef(false);
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
  const pending = pendingQuantity !== null;
  const quantity = pendingQuantity ?? line.quantity;
  const lineMaximum = Math.min(maximum, line.available_quantity);
  const controlsDisabled =
    busy ||
    pending ||
    line.state === "UNAVAILABLE" ||
    line.state === "OUT_OF_STOCK" ||
    line.state === "QUANTITY_REVIEW";
  return (
    <li className="cart-line" id={`cart-line-${line.id}`} tabIndex={-1}>
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
        {line.options.length > 0 && (
          <p className="cart-line-options">{line.options.join(" · ")}</p>
        )}
        <p className="cart-unit-price">
          <Price value={line.unit_price_minor} /> each
        </p>
        {(line.state !== "AVAILABLE" || line.low_stock) && (
          <p id={`state-${line.id}`} className="cart-line-state" role="status">
            {heldByExistingOrder(line)
              ? "Part of your unfinished order. Finish or cancel that order before checking out again."
              : line.state === "QUANTITY_REVIEW"
                ? `Only ${line.available_quantity} available now.`
                : line.state === "AVAILABLE"
                  ? `Only ${line.available_quantity} left.`
                  : stateText[line.state]}
          </p>
        )}
        {line.state === "QUANTITY_REVIEW" && !heldByExistingOrder(line) && (
          <Button
            variant="secondary"
            className="cart-line-reconcile"
            disabled={busy}
            aria-label={`Update to ${line.suggested_quantity} for ${line.name}`}
            onClick={() => void changeQuantity(line.suggested_quantity)}
          >
            Update to {line.suggested_quantity}
          </Button>
        )}
      </div>
      <div className="cart-line-actions">
        <QuantityStepper
          value={quantity}
          max={lineMaximum}
          label={`Quantity for ${line.name}`}
          disabled={controlsDisabled}
          pending={pending}
          onChange={(next) => void changeQuantity(next)}
        />
        <span className="cart-line-pending" role="status">
          {pending ? "Updating…" : ""}
        </span>
        <p className="cart-line-total">
          <span className="sr-only">Line total: </span>
          <Price value={line.line_subtotal_minor} />
          {line.state !== "AVAILABLE" && (
            <span className="cart-line-excluded">Not in subtotal</span>
          )}
        </p>
        <button
          type="button"
          className="cart-remove"
          disabled={busy || pending}
          aria-label={`Remove ${line.name} from cart`}
          title={`Remove ${line.name} from cart`}
          onClick={async () => {
            if (await remove(line.id)) onRemoved();
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" />
          </svg>
        </button>
      </div>
    </li>
  );
}
export function CartPage() {
  const { cart, loading, busy, error, notice, refresh, clear } = useCart();
  const { user, loading: authLoading } = useAuth();
  const heading = useRef<HTMLHeadingElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [recoveryTick, setRecoveryTick] = useState(0);
  const [guestRecovery, setGuestRecovery] = useState<{
    version: number;
    linked_order: NonNullable<CartData["linked_order"]>;
    held_items: Record<string, number>;
  } | null>(null);
  const cartVersion = cart?.version;
  const refreshRecovery = useCallback(async () => {
    await refresh();
    setRecoveryTick((value) => value + 1);
  }, [refresh]);
  useEffect(() => {
    if (authLoading || user || cartVersion === undefined) return;
    let id: string | null = null;
    try {
      id = localStorage.getItem("iranti-guest-recovery-order");
    } catch {
      return;
    }
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let live = true;
    orderRequest<{
      linked_order: NonNullable<CartData["linked_order"]>;
      held_items: Record<string, number>;
    }>(`/orders/${id}/cart-recovery`)
      .then((result) => {
        if (live) setGuestRecovery({ version: cartVersion, ...result });
      })
      .catch(() => {
        if (live) setGuestRecovery(null);
      });
    return () => {
      live = false;
    };
  }, [authLoading, user, cartVersion, recoveryTick]);
  const linked =
    cart?.linked_order ??
    (!user && guestRecovery?.version === cartVersion
      ? guestRecovery?.linked_order
      : null);
  const items =
    cart?.items.map((line) => ({
      ...line,
      held_by_order_quantity: cart.linked_order
        ? line.held_by_order_quantity
        : guestRecovery?.version === cart.version
          ? guestRecovery.held_items[line.variant_id]
          : undefined,
    })) ?? [];
  const reviewLines = items.filter((line) => line.state !== "AVAILABLE");
  useEffect(() => {
    if (linked?.status !== "PENDING_PAYMENT") return;
    const timer = window.setInterval(() => void refreshRecovery(), 30000);
    return () => window.clearInterval(timer);
  }, [linked?.status, linked?.id, refreshRecovery]);
  function focusAfterRemoval(id: string) {
    const index = cart?.items.findIndex((line) => line.id === id) ?? -1;
    const next = cart?.items[index + 1] ?? cart?.items[index - 1];
    setTimeout(() => {
      const target = next
        ? document.getElementById(`cart-line-${next.id}`)
        : null;
      (target ?? heading.current)?.focus();
    }, 0);
  }
  return (
    <main id="main-content" className="cart-main">
      <Container>
        <header className="cart-page-header">
          <h1 tabIndex={-1} ref={heading}>
            Your bag
          </h1>
          {cart && (
            <p>
              {cart.item_count} {cart.item_count === 1 ? "item" : "items"}
            </p>
          )}
        </header>
        {!loading && (
          <div role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {loading && (
          <PageSkeleton
            kind="cart"
            label="Loading your cart"
            showHeading={false}
          />
        )}
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
            Your bag was updated after sign-in. Please review any marked items.
          </p>
        )}
        {linked && <CartRecovery order={linked} refresh={refreshRecovery} />}
        {cart?.needs_review && (
          <section
            className="cart-attention"
            aria-labelledby="cart-attention-heading"
          >
            <h2 id="cart-attention-heading">Some items need attention</h2>
            <p>
              {reviewLines.length}{" "}
              {reviewLines.length === 1 ? "item is" : "items are"} excluded from
              the available-items subtotal. See the reason beside each item.
            </p>
            <ul>
              {reviewLines.map((line) => (
                <li key={line.id}>
                  <a href={`#cart-line-${line.id}`}>
                    {line.name}
                    {line.options.length
                      ? ` — ${line.options.join(" · ")}`
                      : ""}{" "}
                    — {reviewText(line)}
                  </a>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void refreshRecovery()}
            >
              Refresh availability
            </Button>
          </section>
        )}
        {cart && cart.items.length === 0 && (
          <section className="cart-empty">
            <h2>Your bag is empty</h2>
            <p>Discover pieces made to be remembered.</p>
            <Link className="button button--primary" href="/products">
              Explore the collection
            </Link>
          </section>
        )}
        {cart && cart.items.length > 0 && (
          <>
            <div className="cart-layout">
              <div className="cart-items-column">
                <ul className="cart-lines" aria-label="Items in your bag">
                  {items.map((line) => (
                    <Line
                      key={line.id}
                      line={line}
                      maximum={cart.limits.quantity}
                      onRemoved={() => focusAfterRemoval(line.id)}
                    />
                  ))}
                </ul>
              </div>
              <aside
                className={`cart-summary${cart.needs_review ? " cart-summary--review" : ""}`}
                aria-labelledby="cart-summary-heading"
              >
                <h2 id="cart-summary-heading">Order summary</h2>
                <dl className="cart-summary-details">
                  <div>
                    <dt>
                      Subtotal{cart.needs_review ? " of available items" : ""}
                    </dt>
                    <dd>
                      <Price value={cart.subtotal_minor} />
                    </dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>Calculated at checkout</dd>
                  </div>
                </dl>
                <div className="cart-estimated-total">
                  <span>Estimated total</span>
                  <strong>
                    <Price value={cart.subtotal_minor} />
                  </strong>
                </div>
                <p className="cart-summary-note">
                  Before delivery. Your final total appears at checkout.
                </p>
                {cart.needs_review && (
                  <p className="cart-summary-note">
                    {reviewLines.length}{" "}
                    {reviewLines.length === 1 ? "item is" : "items are"}{" "}
                    excluded from this subtotal.
                  </p>
                )}
                {!cart.needs_review && (!linked || linked.can_start_new) && (
                  <Link
                    className="button button--primary cart-checkout"
                    href="/checkout?from=cart"
                  >
                    Proceed to checkout
                  </Link>
                )}
                <Link className="text-link cart-continue" href="/products">
                  Continue shopping
                </Link>
                <Button
                  variant="quiet"
                  className="cart-clear"
                  disabled={busy}
                  onClick={() => setClearOpen(true)}
                >
                  Clear cart
                </Button>
              </aside>
            </div>
            <CartRecommendations lines={cart.items} />
          </>
        )}
      </Container>
      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear your bag?"
        initialFocus=".cart-clear-cancel"
        className="cart-clear-modal"
      >
        <p>This removes every item from your bag.</p>
        <div className="cart-clear-modal-actions">
          <Button
            variant="secondary"
            className="cart-clear-cancel"
            disabled={busy}
            onClick={() => setClearOpen(false)}
          >
            Keep my bag
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              const cleared = await clear();
              setClearOpen(false);
              if (cleared) setTimeout(() => heading.current?.focus(), 0);
            }}
          >
            Clear bag
          </Button>
        </div>
      </Modal>
    </main>
  );
}
