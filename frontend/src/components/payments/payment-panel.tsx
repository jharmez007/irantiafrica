"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { orderRequest, type OrderRecord } from "@/lib/order-api";
import { Button, Price } from "@/components/ui";
export type Attempt = {
  id: string;
  reference: string;
  method: string;
  amount_minor: string;
  currency: string;
  status: string;
  created_at: string;
  last_checked_at: string | null;
  authorization_url?: string | null;
};
export type PaymentSummary = { order: OrderRecord; attempts: Attempt[] };
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
export function PaymentPanel({
  order,
  returning = false,
  changed,
}: {
  order: OrderRecord;
  returning?: boolean;
  changed?: () => void;
}) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    returning ? "Verifying payment with the provider…" : "",
  );
  const [error, setError] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const key = useRef<{ method: string; value: string } | null>(null);
  const resultFocus = useRef<HTMLParagraphElement>(null);
  const root = `/orders/${order.id}`;
  const load = useCallback(
    async (verify: boolean) => {
      const seq = ++generation.current;
      try {
        let s = await orderRequest<PaymentSummary>(`${root}/payment-status`);
        // Query-string success/reference is deliberately ignored; use the owned stored attempt.
        if (verify && s.attempts[0])
          s = await orderRequest<PaymentSummary>(
            `${root}/payment-attempts/${s.attempts[0].id}/verify`,
            "POST",
            {},
          );
        if (seq === generation.current) {
          setSummary(s);
          setMessage("");
          if (verify) changed?.();
        }
      } catch (e) {
        if (seq === generation.current) {
          setError(e instanceof Error ? e.message : "Unable to check payment.");
          setMessage("");
        }
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
    queueMicrotask(() => {
      if (live) void load(returning);
    });
    return () => {
      live = false;
      mounted.current = false;
      invalidate();
    };
  }, [load, returning, invalidate]);
  const current = summary?.order.id === order.id ? summary.order : order;
  const attempts = summary?.order.id === order.id ? summary.attempts : [];
  const active = attempts.find((a) =>
    ["INITIALIZING", "PENDING", "UNKNOWN"].includes(a.status),
  );
  async function pay() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
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
        const url = new URL(a.authorization_url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "checkout.paystack.com" ||
          url.username ||
          url.password ||
          url.port
        )
          throw new Error("The payment destination could not be verified.");
        window.location.assign(url.href);
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
    setMessage("Verifying payment with the provider…");
    try {
      await load(true);
      key.current = null;
    } finally {
      lock.current = false;
      setBusy(false);
      resultFocus.current?.focus();
    }
  }
  return (
    <section className="payment-panel" aria-labelledby="payment-heading">
      <h2 id="payment-heading">Payment</h2>
      <p role="status" tabIndex={-1} ref={resultFocus}>
        {message || paymentMessage(current.payment.state, current.status)}
      </p>
      {error && <p role="alert">{error}</p>}
      <p>
        Order {current.number} · <Price value={current.total_minor} />
      </p>
      {current.payment.available &&
        !active &&
        ["NOT_STARTED", "FAILED", "ABANDONED"].includes(
          current.payment.state,
        ) && (
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
            <p>
              Your reservation keeps its original deadline. A return from
              Paystack alone does not confirm payment.
            </p>
            <Button type="button" disabled={busy} onClick={() => void pay()}>
              {["FAILED", "ABANDONED"].includes(current.payment.state)
                ? "Retry payment with Paystack"
                : "Continue to Paystack"}
            </Button>
          </>
        )}
      {active && (
        <p>One payment is already in progress. Do not send a second payment.</p>
      )}
      {attempts.length > 0 && (
        <Button type="button" disabled={busy} onClick={() => void recheck()}>
          Recheck payment
        </Button>
      )}
      {!current.payment.available &&
        current.payment.state === "NOT_STARTED" && (
          <p>Payment is currently unavailable. Your order has been retained.</p>
        )}
      {attempts.length > 0 && (
        <ul className="order-list">
          {attempts.map((a) => (
            <li key={a.id} className="order-card">
              <p>Reference: {a.reference}</p>
              <p>
                {a.status.replaceAll("_", " ")} ·{" "}
                {a.method.replaceAll("_", " ")} ·{" "}
                <Price value={a.amount_minor} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
