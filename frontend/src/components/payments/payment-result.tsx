"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { useCart } from "@/components/cart/cart-provider";
import { Button, Container, Price } from "@/components/ui";
import { orderRequest } from "@/lib/order-api";
import { paymentMessage, type PaymentSummary } from "./payment-panel";

const active = (status: string) =>
  ["INITIALIZING", "PENDING", "UNKNOWN"].includes(status);

export function PaymentResult({ id }: { id: string }) {
  const { refresh: refreshCart } = useCart();
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [polls, setPolls] = useState(0);
  const generation = useRef(0);
  const lock = useRef(false);
  const refreshedPaidOrder = useRef<string | null>(null);
  const root = `/orders/${id}`;
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const check = useCallback(
    async (verify: boolean) => {
      if (lock.current) return;
      lock.current = true;
      const request = ++generation.current;
      setChecking(true);
      setError("");
      try {
        let next = await orderRequest<PaymentSummary>(`${root}/payment-status`);
        // A callback reference may select only an attempt already returned by the
        // owned-order API. It never grants access or proves payment success.
        const returnedReference = new URLSearchParams(
          window.location.search,
        ).get("reference");
        const attempt =
          next.attempts.find((item) => item.reference === returnedReference) ??
          next.attempts[0];
        if (verify && attempt && active(attempt.status))
          next = await orderRequest<PaymentSummary>(
            `${root}/payment-attempts/${attempt.id}/verify`,
            "POST",
            {},
          );
        if (request === generation.current) setSummary(next);
      } catch (failure) {
        if (request === generation.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Payment status could not be confirmed. Check again.",
          );
      } finally {
        lock.current = false;
        if (request === generation.current) setChecking(false);
      }
    },
    [root],
  );
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (live) void check(true);
    });
    return () => {
      live = false;
      invalidate();
    };
  }, [check, invalidate]);
  const order = summary?.order;
  const unresolved =
    !!order &&
    order.payment.state !== "SUCCESSFUL" &&
    summary.attempts.some((attempt) => active(attempt.status));
  useEffect(() => {
    if (!unresolved || checking || error || polls >= 3) return;
    const timer = window.setTimeout(() => {
      setPolls((count) => count + 1);
      void check(false);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [unresolved, checking, error, polls, check]);
  const orderUrl = order
    ? `${order.ownership === "guest" ? "/orders" : "/account/orders"}/${order.id}`
    : null;
  const successful = order?.payment.state === "SUCCESSFUL";
  useEffect(() => {
    if (!successful || refreshedPaidOrder.current === id) return;
    refreshedPaidOrder.current = id;
    void refreshCart();
  }, [successful, id, refreshCart]);
  const retryAllowed =
    !!order &&
    order.payment.available &&
    !unresolved &&
    ["FAILED", "ABANDONED", "NOT_STARTED"].includes(order.payment.state);
  return (
    <main id="main-content" className="payment-result-main">
      <Container>
        <article className="payment-result-card">
          <div className="payment-result-intro">
            <div className="payment-result-seal" aria-hidden="true">
              <Logo
                variant="mark"
                linked={false}
                className="payment-result-mark"
              />
            </div>
            <p className="eyebrow">IRANTI Africa · Secure payment</p>
            <h1>
              {successful
                ? "Payment successful"
                : checking && !order
                  ? "Confirming your payment…"
                  : "Payment update"}
            </h1>
            {successful && (
              <p className="payment-result-lead">Thank you for your order.</p>
            )}
          </div>
          {order && (
            <dl className="payment-result-summary">
              <div>
                <dt>Order reference</dt>
                <dd>{order.number}</dd>
              </div>
              {successful && (
                <div>
                  <dt>Amount paid</dt>
                  <dd>
                    <Price value={order.total_minor} />
                  </dd>
                </div>
              )}
            </dl>
          )}
          <div className="payment-result-followup">
            <p
              className={`payment-result-status${successful ? " sr-only" : ""}`}
              role="status"
              aria-live="polite"
            >
              {checking
                ? "Confirming your payment…"
                : successful
                  ? "Your payment has been verified."
                  : unresolved
                    ? polls >= 3
                      ? "Payment is still being confirmed. Check again shortly; please do not start another payment."
                      : "Payment is still being confirmed. Please do not start another payment."
                    : order
                      ? paymentMessage(order.payment.state, order.status)
                      : "Payment status is not available yet."}
            </p>
            {error && (
              <p className="payment-result-error" role="alert">
                {error}
              </p>
            )}
            <div className="payment-result-actions">
              {(error || (!successful && (unresolved || order))) && (
                <Button
                  variant={retryAllowed ? "secondary" : "primary"}
                  disabled={checking}
                  onClick={() => void check(true)}
                >
                  Check again
                </Button>
              )}
              {retryAllowed && (
                <Link className="button button--primary" href="/checkout">
                  Try payment again
                </Link>
              )}
              {orderUrl && (
                <Link
                  className={
                    successful ? "button button--primary" : "text-link"
                  }
                  href={orderUrl}
                >
                  View order
                </Link>
              )}
              <Link className="text-link" href="/products">
                Continue shopping
              </Link>
            </div>
          </div>
        </article>
      </Container>
    </main>
  );
}
