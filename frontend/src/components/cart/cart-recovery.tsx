"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button, Modal, Price } from "@/components/ui";
import type { CartData } from "@/lib/cart-api";
import { orderRequest, type OrderRecord } from "@/lib/order-api";
import type { PaymentSummary } from "@/components/payments/payment-panel";
import { continueHostedPayment } from "@/lib/hosted-payment";
import { toast } from "@/lib/toast";

type LinkedOrder = NonNullable<CartData["linked_order"]>;
const active = (status: string) =>
  ["INITIALIZING", "PENDING", "UNKNOWN"].includes(status);

export function CartRecovery({
  order,
  refresh,
}: {
  order: LinkedOrder;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<
    "payment" | "checking" | "cancelling" | null
  >(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const locked = useRef(false);
  const checked = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const orderUrl = `${order.ownership === "guest" ? "/orders" : "/account/orders"}/${order.id}`;
  const pending =
    order.status === "PENDING_PAYMENT" && order.payment_state !== "SUCCESSFUL";
  const paid = order.payment_state === "SUCCESSFUL";
  const needsConfirmation = order.payment_unresolved && !order.can_continue;

  const checkStatus = useCallback(
    async (showProgress = false) => {
      if (locked.current) return;
      locked.current = true;
      setWorking("checking");
      setError("");
      setMessage(showProgress ? "Checking your order…" : "");
      try {
        const root = `/orders/${order.id}`;
        let summary = await orderRequest<PaymentSummary>(
          `${root}/payment-status`,
        );
        const attempt = summary.attempts.find((item) => active(item.status));
        if (attempt)
          summary = await orderRequest<PaymentSummary>(
            `${root}/payment-attempts/${attempt.id}/verify`,
            "POST",
            {},
          );
        await refresh();
        setMessage(
          showProgress && summary.order.payment.state !== "SUCCESSFUL"
            ? summary.attempts.some((item) => active(item.status))
              ? "We’re still confirming your earlier payment. Your bag is saved."
              : "Your order has been updated."
            : "",
        );
      } catch {
        setError("We couldn’t update your order right now. Please try again.");
      } finally {
        locked.current = false;
        setWorking(null);
      }
    },
    [order.id, refresh],
  );

  useEffect(() => {
    if (!order.payment_unresolved) return;
    const key = `${order.id}:${order.attempt_status}`;
    if (checked.current === key) return;
    checked.current = key;
    queueMicrotask(() => void checkStatus());
  }, [order.id, order.attempt_status, order.payment_unresolved, checkStatus]);

  async function continuePayment() {
    if (locked.current || !order.can_continue) return;
    locked.current = true;
    setWorking("payment");
    setError("");
    setMessage("Checking your order before payment…");
    try {
      const result = await continueHostedPayment(order.id, () =>
        setMessage("Redirecting to Paystack…"),
      );
      if (result === "successful")
        router.push(`/orders/${order.id}/payment-return`);
    } catch {
      setError(
        "We couldn’t continue this order. Your bag is saved. Please try again.",
      );
      setMessage("");
      await refresh();
    } finally {
      locked.current = false;
      setWorking(null);
    }
  }

  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !order.can_cancel) return;
    locked.current = true;
    setWorking("cancelling");
    setError("");
    try {
      const latest = await orderRequest<OrderRecord>(`/orders/${order.id}`);
      if (!latest.can_cancel)
        throw new Error(
          "This order can no longer be cancelled. Check its payment status.",
        );
      await orderRequest<OrderRecord>(`/orders/${order.id}/cancel`, "POST", {
        expected_version: latest.version,
        reason: "Customer cancelled before payment",
      });
      setCancelOpen(false);
      await refresh();
      toast.success("Order cancelled. Your bag has been kept.");
      setMessage("");
      setTimeout(() => {
        const next =
          document.querySelector<HTMLAnchorElement>(".cart-checkout") ??
          heading.current ??
          document.querySelector<HTMLHeadingElement>(".cart-page-header h1");
        next?.focus();
      }, 0);
    } catch {
      setError("We couldn’t cancel this order. Please try again.");
      await refresh();
    } finally {
      locked.current = false;
      setWorking(null);
    }
  }

  if (order.can_start_new && !paid) return null;

  return (
    <section className="cart-recovery" aria-labelledby="cart-recovery-heading">
      <h2 id="cart-recovery-heading" tabIndex={-1} ref={heading}>
        {paid
          ? "Your payment is confirmed."
          : needsConfirmation
            ? "We’re confirming your earlier payment."
            : order.can_continue
              ? "Finish your order."
              : "Your bag is saved."}
      </h2>
      {order.can_continue && (
        <p>
          Continue your earlier order <strong>{order.number}</strong> for{" "}
          <strong>
            <Price value={order.total_minor} />
          </strong>
          .
        </p>
      )}
      {order.can_continue && order.cart_changed && (
        <p>
          Your bag has changed. Continuing opens the earlier order with its
          original items and total.
        </p>
      )}
      {needsConfirmation && (
        <p>
          Your bag is saved. Please wait before placing another order so you
          aren’t charged twice.
        </p>
      )}
      {needsConfirmation && (
        <p>
          Need help? Contact us with order reference{" "}
          <strong>{order.number}</strong>.
        </p>
      )}
      {pending &&
        !order.reservation_active &&
        !order.release_confirmed &&
        !needsConfirmation && (
          <p>
            We’re getting your bag ready for checkout. Please try again shortly.
          </p>
        )}
      {paid && <p>View your order for the latest details.</p>}
      {message && <p role="status">{message}</p>}
      {error && !cancelOpen && <p role="alert">{error}</p>}
      <div className="cart-recovery-actions">
        {order.can_continue &&
          !["INITIALIZING", "UNKNOWN"].includes(order.attempt_status ?? "") && (
            <Button
              type="button"
              disabled={!!working}
              loading={working === "payment"}
              onClick={() => void continuePayment()}
            >
              Continue payment
            </Button>
          )}
        {needsConfirmation && (
          <Link className="button button--primary" href="/contact">
            Get help
          </Link>
        )}
        {error && needsConfirmation && (
          <Button
            type="button"
            variant="secondary"
            disabled={!!working}
            loading={working === "checking"}
            onClick={() => void checkStatus(true)}
          >
            Try again
          </Button>
        )}
        {order.can_cancel && !order.can_start_new && (
          <button
            type="button"
            className="button button--secondary"
            disabled={!!working}
            onClick={() => setCancelOpen(true)}
          >
            Cancel pending order
          </button>
        )}
        <Link href={orderUrl}>View order</Link>
      </div>
      <Modal
        open={cancelOpen && order.can_cancel}
        onClose={() => {
          if (working !== "cancelling") setCancelOpen(false);
        }}
        title="Cancel pending order?"
        descriptionId="cart-cancel-description"
      >
        <form onSubmit={(event) => void cancel(event)}>
          <p id="cart-cancel-description">
            This will cancel the order and keep the items in your bag. You can
            check out again if they’re still available.
          </p>
          {error && cancelOpen && <p role="alert">{error}</p>}
          <div className="cart-recovery-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={working === "cancelling"}
              onClick={() => setCancelOpen(false)}
            >
              Keep order
            </Button>
            <Button
              type="submit"
              disabled={working === "cancelling"}
              loading={working === "cancelling"}
            >
              Cancel order
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
