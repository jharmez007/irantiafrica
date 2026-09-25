"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { type Checkout } from "@/lib/checkout-api";
import { orderRequest, type OrderRecord } from "@/lib/order-api";
export function PlaceOrder({
  checkout,
  onCreated,
}: {
  checkout: Checkout;
  onCreated?: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<OrderRecord | null>(null);
  const key = useRef<string | null>(null);
  const focus = useRef<HTMLDivElement>(null);
  const id = placed?.id ?? checkout.order_id;
  const route = checkout.ownership === "guest" ? "/orders" : "/account/orders";
  async function place() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const body = {
      checkout_id: checkout.id,
      expected_version: checkout.version,
      fingerprint: checkout.fingerprint,
    };
    try {
      if (!key.current) {
        const storageKey = "iranti-order-create-" + checkout.id;
        const previous = sessionStorage.getItem(storageKey);
        key.current = previous ?? crypto.randomUUID();
        sessionStorage.setItem(storageKey, key.current);
      }
    } catch {
      key.current ??= crypto.randomUUID();
    }
    try {
      const result = await orderRequest<OrderRecord>(
        "/orders",
        "POST",
        body,
        key.current!,
      );
      setPlaced(result);
      onCreated?.(result.id);
      queueMicrotask(() => focus.current?.focus());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Order creation could not be confirmed. Retry with the same checkout.",
      );
      queueMicrotask(() => focus.current?.focus());
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section aria-label="Create order">
      <div tabIndex={-1} ref={focus} role={error ? "alert" : "status"}>
        {error && <p>{error}</p>}
        {id && (
          <p>
            Order created — payment is still required. Payment is not available
            yet.
          </p>
        )}
      </div>
      {id ? (
        <Link className="text-link" href={`${route}/${id}`}>
          View your order
        </Link>
      ) : (
        <>
          <p>
            Create an unpaid order from this reviewed total. Your cart will be
            kept.
          </p>
          <Button disabled={busy} onClick={() => void place()}>
            {busy ? "Creating order…" : "Create order — payment pending"}
          </Button>
        </>
      )}
      {checkout.ownership === "guest" && (
        <p>
          Guest access is limited to this browser and has an absolute expiry.
          Email recovery is not available yet.
        </p>
      )}
    </section>
  );
}
