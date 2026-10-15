"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { orderRequest, type OrderRecord } from "@/lib/order-api";
import { Button, Price } from "@/components/ui";
import { trustedPaystackUrl } from "@/lib/payment-destination";
export type Attempt = {
  id: string;
  reference: string;
  method: string;
  amount_minor: string;
  currency: string;
  status: string;
  failure_code?: string | null;
  created_at: string;
  last_checked_at: string | null;
  authorization_url?: string | null;
};
export type PaymentSummary = { order: OrderRecord; attempts: Attempt[] };
const isActiveAttempt = (attempt: Attempt) =>
  ["INITIALIZING", "PENDING", "UNKNOWN"].includes(attempt.status);
export const paymentMessage = (state: string, orderStatus?: string) =>
  ({
    NOT_STARTED: "Payment not started.",
    PENDING:
      "Payment awaiting confirmation. Recheck this payment before trying again.",
    SUCCESSFUL:
      orderStatus === "SHIPPED" || orderStatus === "DELIVERED"
        ? "Payment confirmed. Your order is paid."
        : "Payment confirmed. Your order is paid. Shipment has not been confirmed.",
    FAILED:
      "The provider confirmed this attempt failed. You can retry while the reservation remains valid.",
    ABANDONED:
      "The provider reports this attempt was not completed. You can retry while the reservation remains valid.",
    REQUIRES_REVIEW:
      "Payment requires review. Your order is retained. Please do not make another payment.",
  })[state] ?? "Payment status is being checked.";

function customerPaymentCopy(order: OrderRecord, active?: Attempt) {
  if (order.payment.state === "SUCCESSFUL")
    return { label: "Payment successful", explanation: "" };
  if (order.payment.state === "REQUIRES_REVIEW")
    return {
      label: "Unable to confirm payment status",
      explanation:
        "This payment needs review. Please do not make another payment.",
    };
  if (active?.status === "UNKNOWN")
    return {
      label: "Unable to confirm payment status",
      explanation:
        active.failure_code === "RECONCILIATION_EXHAUSTED"
          ? "Repeated checks have not confirmed this payment. Do not make another payment."
          : order.reservation?.eligible
            ? "We couldn’t confirm your payment status. Check again before making another payment."
            : "We couldn’t confirm your payment status. The stock reservation has expired; check again before making another payment.",
    };
  if (active)
    return {
      label: "Awaiting confirmation",
      explanation:
        "Paystack has not confirmed this payment. Check its status before paying again.",
    };
  if (order.payment.state === "PENDING")
    return {
      label: "Awaiting confirmation",
      explanation:
        "Paystack has not confirmed this payment. Check its status before paying again.",
    };
  if (["FAILED", "ABANDONED"].includes(order.payment.state))
    return {
      label: "Payment unsuccessful",
      explanation: order.payment.available
        ? "You can retry while this order’s stock reservation remains active."
        : "This order can no longer take another payment.",
    };
  return {
    label: "Payment not started",
    explanation: order.payment.available
      ? "Continue to secure Paystack checkout when you are ready."
      : order.status === "PENDING_PAYMENT" && !order.reservation?.eligible
        ? "This order’s stock reservation has ended. Review stock before another checkout."
        : "Payment is unavailable for this order.",
  };
}
function paymentCheckFeedback(summary: PaymentSummary, before?: Attempt) {
  if (summary.order.payment.state === "SUCCESSFUL")
    return "Payment confirmed. Your order is paid.";
  if (summary.order.payment.state === "REQUIRES_REVIEW")
    return "The payment still needs review. Please contact us before making another payment.";
  const active = summary.attempts.find(isActiveAttempt);
  if (active?.status === "UNKNOWN")
    return active.last_checked_at &&
      active.last_checked_at !== before?.last_checked_at
      ? "We tried again, but the payment status is still unconfirmed. Please do not make another payment."
      : "No new payment confirmation was available. Please try again later and do not make another payment.";
  if (active)
    return "The payment is still awaiting confirmation. Please do not make another payment.";
  if (["FAILED", "ABANDONED"].includes(summary.order.payment.state))
    return "The payment was unsuccessful. Review the available action below.";
  return "The latest payment status is shown above.";
}
function checkedDate(value: string) {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const withOffset = /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso;
  const timestamp = new Date(withOffset);
  if (Number.isNaN(timestamp.getTime())) return null;
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(timestamp);
}
export function PaymentPanel({
  order,
  returning = false,
  changed,
  compact = false,
}: {
  order: OrderRecord;
  returning?: boolean;
  changed?: () => void;
  compact?: boolean;
}) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    returning ? "Verifying payment with the provider…" : "",
  );
  const [error, setError] = useState("");
  const [checkFeedback, setCheckFeedback] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const key = useRef<{ method: string; value: string } | null>(null);
  const resultFocus = useRef<HTMLParagraphElement>(null);
  const root = `/orders/${order.id}`;
  const load = useCallback(
    async (verify: boolean): Promise<PaymentSummary | null> => {
      const seq = ++generation.current;
      try {
        let s = await orderRequest<PaymentSummary>(`${root}/payment-status`);
        // Query-string success/reference is deliberately ignored; use the owned stored attempt.
        const activeAttempt = s.attempts?.find(isActiveAttempt);
        if (verify && activeAttempt)
          s = await orderRequest<PaymentSummary>(
            `${root}/payment-attempts/${activeAttempt.id}/verify`,
            "POST",
            {},
          );
        if (seq !== generation.current) return null;
        setSummary(s);
        setMessage("");
        if (!verify) setCheckFeedback("");
        if (verify) changed?.();
        return s;
      } catch (e) {
        if (seq === generation.current) {
          setError(e instanceof Error ? e.message : "Unable to check payment.");
          setMessage("");
        }
        return null;
      }
    },
    [root, changed],
  );
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    let live = true;
    mounted.current = true;
    if (
      returning ||
      order.payment.available ||
      order.payment.state !== "NOT_STARTED"
    ) {
      queueMicrotask(() => {
        if (live) void load(returning);
      });
    }
    return () => {
      live = false;
      mounted.current = false;
      invalidate();
    };
  }, [
    load,
    returning,
    invalidate,
    order.payment.available,
    order.payment.state,
  ]);
  const current = summary?.order?.id === order.id ? summary.order : order;
  const attempts =
    summary?.order?.id === order.id ? (summary.attempts ?? []) : [];
  const active = attempts.find(isActiveAttempt);
  const lastChecked = attempts.find(
    (attempt) => attempt.last_checked_at,
  )?.last_checked_at;
  const lastCheckedLabel = lastChecked ? checkedDate(lastChecked) : null;
  const paymentCopy = customerPaymentCopy(current, active);
  const canPay =
    current.payment.available &&
    !active &&
    ["NOT_STARTED", "FAILED", "ABANDONED"].includes(current.payment.state);
  async function pay() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setCheckFeedback("");
    setMessage("Opening secure Paystack checkout…");
    if (!key.current || key.current.method !== method)
      key.current = { method, value: crypto.randomUUID() };
    try {
      const a = await orderRequest<Attempt>(
        `${root}/payment-attempts`,
        "POST",
        { method },
        key.current.value,
      );
      await load(false);
      if (!mounted.current) return;
      changed?.();
      if (a.authorization_url) {
        window.location.assign(trustedPaystackUrl(a.authorization_url));
      } else if (a.status === "FAILED") {
        key.current = null;
        setError(
          "Paystack did not start this payment. You can retry while the order's stock reservation remains active.",
        );
        setMessage("");
      } else
        setMessage(
          "Payment initialization is awaiting confirmation. Recheck payment; do not start another attempt.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment could not be started.",
      );
      setMessage("");
    } finally {
      lock.current = false;
      setBusy(false);
      resultFocus.current?.focus();
    }
  }
  async function recheck() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setCheckFeedback("");
    setMessage("Checking payment…");
    try {
      const result = await load(true);
      if (result) setCheckFeedback(paymentCheckFeedback(result, active));
      key.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
      resultFocus.current?.focus();
    }
  }
  return (
    <section
      className={`payment-panel${compact ? " payment-panel--compact" : ""}`}
      aria-labelledby="payment-heading"
    >
      <h2 id="payment-heading">Payment</h2>
      <p
        className="payment-panel-status"
        role="status"
        tabIndex={-1}
        ref={resultFocus}
      >
        <strong>{message || paymentCopy.label}</strong>
        {!message && (checkFeedback || paymentCopy.explanation) && (
          <span>{checkFeedback || paymentCopy.explanation}</span>
        )}
      </p>
      {lastCheckedLabel && current.payment.state !== "SUCCESSFUL" && (
        <p className="payment-panel-last-checked">
          Last checked {lastCheckedLabel} WAT
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!compact && (
        <p>
          Order {current.number} · <Price value={current.total_minor} />
        </p>
      )}
      {active?.status === "UNKNOWN" && !current.reservation?.eligible && (
        <p>
          <Link href="/contact">Contact us</Link> with your order reference if
          the status remains unconfirmed.
        </p>
      )}
      {canPay && (
        <>
          <label htmlFor="payment-method">Payment method</label>
          <select
            id="payment-method"
            value={method}
            disabled={busy}
            onChange={(e) => {
              setMethod(e.target.value);
              key.current = null;
            }}
          >
            <option value="card">Card — secure Paystack checkout</option>
            <option value="bank_transfer">
              Bank transfer — confirmed by Paystack
            </option>
          </select>
          <Button type="button" disabled={busy} onClick={() => void pay()}>
            {["FAILED", "ABANDONED"].includes(current.payment.state)
              ? "Retry payment with Paystack"
              : "Continue to Paystack"}
          </Button>
        </>
      )}
      {!canPay &&
        attempts.length > 0 &&
        current.payment.state !== "SUCCESSFUL" && (
          <Button
            type="button"
            disabled={busy}
            loading={busy}
            onClick={() => void recheck()}
          >
            {busy ? "Checking payment…" : "Check payment status"}
          </Button>
        )}
      {attempts.length > 0 && (
        <details className="payment-panel-details">
          <summary>Payment details</summary>
          <ol>
            {attempts.map((a) => (
              <li key={a.id}>
                <dl>
                  <div>
                    <dt>Payment reference</dt>
                    <dd>{a.reference}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      <Price value={a.amount_minor} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
