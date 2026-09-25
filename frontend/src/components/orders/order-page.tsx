"use client";
import Link from "next/link";
import { ReturnsPanel } from "@/components/returns/returns-panel";
import { FulfilmentPanel } from "./fulfilment-panel";
import {
  PaymentPanel,
  paymentMessage,
} from "@/components/payments/payment-panel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/brand/layouts";
import { Button, Price } from "@/components/ui";
import {
  orderRequest,
  type OrderRecord,
  type OrderList,
} from "@/lib/order-api";
const label = (status: string) =>
  status === "PENDING_PAYMENT"
    ? "Pending payment"
    : status === "CANCELLED"
      ? "Cancelled"
      : status.replaceAll("_", " ").toLowerCase();
const date = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
export function OrderPage({
  id,
  admin = false,
  guest = false,
  paymentReturn = false,
}: {
  id?: string;
  admin?: boolean;
  guest?: boolean;
  paymentReturn?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const scope = JSON.stringify([user?.id ?? "guest", id, admin]);
  const sequence = useRef(0);
  const focus = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    scope: string;
    data: OrderRecord | OrderList;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyLock = useRef(false);
  const [reason, setReason] = useState("");
  const [filters, setFilters] = useState({ status: "", from: "", to: "" });
  const [query, setQuery] = useState("");
  const root = admin ? "/admin/orders" : "/orders";
  const route = admin ? "/admin/orders" : guest ? "/orders" : "/account/orders";
  const load = useCallback(
    async (cursor?: string) => {
      if (authLoading) return;
      const current = ++sequence.current;
      setLoading(true);
      setError("");
      try {
        const search = new URLSearchParams(query);
        if (cursor) search.set("cursor", cursor);
        const data = await orderRequest<OrderRecord | OrderList>(
          id ? `${root}/${id}` : `${root}?${search}`,
        );
        if (current === sequence.current) setResult({ scope, data });
      } catch (e) {
        if (current === sequence.current) {
          setError(e instanceof Error ? e.message : "Unable to load orders.");
          setResult(null);
        }
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    },
    [authLoading, id, root, scope, query],
  );
  const reload = useCallback(() => {
    void load();
  }, [load]);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void load();
    });
    return () => {
      alive = false;
      invalidate();
    };
  }, [load, invalidate]);
  useEffect(() => {
    if (error) focus.current?.focus();
  }, [error]);
  const shown = result?.scope === scope ? result.data : null;
  const order = shown && "number" in shown ? shown : null;
  const list = shown && "items" in shown ? shown : null;
  function filter(e: FormEvent) {
    e.preventDefault();
    setQuery(
      new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v),
      ).toString(),
    );
  }
  async function cancel(e: FormEvent) {
    e.preventDefault();
    if (!order || busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError("");
    const current = ++sequence.current;
    try {
      const next = await orderRequest<OrderRecord>(
        `${root}/${order.id}/${admin ? "transitions" : "cancel"}`,
        "POST",
        {
          expected_version: order.version,
          reason: admin ? reason : "Customer cancelled before payment",
        },
      );
      if (current === sequence.current) {
        setResult({ scope, data: next });
        queueMicrotask(() => focus.current?.focus());
      }
    } catch (e) {
      if (current === sequence.current) {
        setError(e instanceof Error ? e.message : "Unable to cancel order.");
        queueMicrotask(() => focus.current?.focus());
      }
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }
  const body = (
    <>
      <nav aria-label="Order navigation" className="order-navigation">
        <Link href={admin ? "/admin" : "/account"}>
          {admin ? "Staff workspace" : "Your account"}
        </Link>
        {id && !guest && <Link href={route}>Order history</Link>}
        <Link href="/products">The collection</Link>
      </nav>
      {!guest && !user && !authLoading && (
        <p>
          <Link href="/login">Sign in to view your orders.</Link>
        </p>
      )}
      {loading && <p role="status">Loading orders…</p>}
      {error && (
        <div role="alert" tabIndex={-1} ref={focus}>
          <p>{error}</p>
          <p>
            Access requires your account or the secure grant issued for this
            order.
          </p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {!id && (
        <form
          className="order-filters"
          onSubmit={filter}
          aria-label="Filter orders"
        >
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">All statuses</option>
              <option value="PENDING_PAYMENT">Pending payment</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="PAID">Paid</option>
              <option value="PROCESSING">Processing</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
              <option value="PAYMENT_REVIEW">Payment review</option>
            </select>
          </label>
          <label>
            From date (UTC)
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            To date (UTC)
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          <Button disabled={loading}>Apply filters</Button>
        </form>
      )}
      {list && (
        <>
          <p role="status">
            {list.items.length === 0
              ? "No orders found."
              : "Orders shown newest first."}
          </p>
          <ul className="order-list">
            {list.items.map((o) => (
              <li key={o.id} className="order-card">
                <h2>
                  <Link href={`${route}/${o.id}`}>{o.number}</Link>
                </h2>
                <p>
                  {label(o.status)} · {date(o.created_at)} WAT
                </p>
                <p>
                  {o.item_count} items · <Price value={o.total_minor} />
                </p>
                {admin && (
                  <p>
                    {o.ownership === "guest" ? "Guest" : "Account"} order ·
                    Reservation {label(o.reservation.status)}
                  </p>
                )}
                <p>{paymentMessage(o.payment.state, o.status)}</p>
              </li>
            ))}
          </ul>
          {list.next_cursor && (
            <Button
              disabled={loading}
              onClick={() => void load(list.next_cursor!)}
            >
              Next page
            </Button>
          )}
        </>
      )}
      {order && (
        <article className="order-detail">
          <header>
            <p className="eyebrow">Order reference</p>
            <h2 className="order-reference">{order.number}</h2>
            <p>
              {date(order.created_at)} WAT · {label(order.status)}
            </p>
            <p role="status" tabIndex={-1} ref={error ? undefined : focus}>
              {order.status === "CANCELLED"
                ? "This order is cancelled."
                : paymentMessage(order.payment.state, order.status)}
            </p>
            <p>Payment: {label(order.payment.state)}</p>
            <p>
              Reservation: {label(order.reservation.status)} · deadline{" "}
              {date(order.reservation.expires_at)} WAT.
            </p>
            {!order.reservation.eligible &&
              order.status === "PENDING_PAYMENT" && (
                <p>
                  This order cannot proceed with its current reservation. Stock
                  must be reviewed before a future payment attempt. Your order
                  has been retained.
                </p>
              )}
            {order.calculation?.development_only && (
              <p className="order-notice">DEVELOPMENT CONFIGURATION ONLY</p>
            )}
          </header>
          {!admin &&
            (order.payment.available ||
              order.payment.state !== "NOT_STARTED" ||
              paymentReturn) && (
              <PaymentPanel
                key={scope}
                order={order}
                returning={paymentReturn}
                changed={reload}
              />
            )}
          {admin &&
            user?.authentication_state === "authenticated" &&
            user.roles?.includes("owner") && (
              <Link href="/admin/payments">
                Payment attempts and reconciliation
              </Link>
            )}
          <FulfilmentPanel
            key={scope}
            order={order}
            admin={admin}
            changed={(data) => {
              sequence.current++;
              setResult({ scope, data });
            }}
          />
          {!admin && <ReturnsPanel key={scope + ":returns"} order={order} />}
          {admin && <Link href="/admin/returns">Returns and refunds</Link>}
          <div className="order-columns">
            <section aria-labelledby="order-items-heading">
              <h2 id="order-items-heading">Your items</h2>
              <ul className="order-list">
                {order.lines?.map((line) => (
                  <li className="order-line" key={line.id}>
                    <h3>{line.snapshot.name}</h3>
                    <p>SKU {line.snapshot.sku}</p>
                    <p>{line.snapshot.options.join(" · ")}</p>
                    <p>
                      Quantity {line.quantity} · Each{" "}
                      <Price value={line.unit_price_minor} />
                    </p>
                    <p>
                      Items <Price value={line.line_subtotal_minor} /> · Tax{" "}
                      <Price value={line.tax_minor} />
                    </p>
                    <p>
                      Line total <Price value={line.line_total_minor} />
                    </p>
                  </li>
                ))}
              </ul>
              {order.contact && (
                <section aria-labelledby="order-delivery-heading">
                  <h2 id="order-delivery-heading">Delivery details</h2>
                  <address className="order-address">
                    {order.contact.address.recipient_name}
                    <br />
                    {order.contact.address.line1}
                    <br />
                    {order.contact.address.line2 && (
                      <>
                        {order.contact.address.line2}
                        <br />
                      </>
                    )}
                    {order.contact.address.city},{" "}
                    {order.contact.address.state_code}
                    <br />
                    {order.contact.address.postal_code} Nigeria
                    <br />
                    {order.contact.address.phone}
                    <br />
                    {order.contact.email}
                  </address>
                </section>
              )}
            </section>
            <section
              className="order-summary"
              aria-labelledby="order-total-heading"
            >
              <h2 id="order-total-heading">Order total</h2>
              <dl>
                {[
                  ["Items subtotal", order.subtotal_minor],
                  ["Product tax", order.product_tax_minor],
                  ["Delivery", order.delivery_minor],
                  ["Delivery tax", order.delivery_tax_minor],
                  ["Tax total", order.tax_minor],
                  ["Total (NGN)", order.total_minor],
                ].map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      <Price value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p>These amounts are the historical order snapshot.</p>
            </section>
          </div>
          {order.can_cancel && (
            <form onSubmit={(e) => void cancel(e)} className="order-cancel">
              {admin && (
                <label>
                  Cancellation reason
                  <textarea
                    required
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              <p>
                Cancel this unpaid order and release any remaining stock hold.
                Order history is retained.
              </p>
              <Button variant="secondary" disabled={busy}>
                {busy ? "Cancelling…" : "Cancel unpaid order"}
              </Button>
            </form>
          )}
          <section aria-labelledby="order-history-heading">
            <h2 id="order-history-heading">Status history</h2>
            <ol>
              {order.history?.map((h, i) => (
                <li key={i}>
                  {label(h.status)} · {date(h.at)} WAT
                </li>
              ))}
            </ol>
          </section>
        </article>
      )}
    </>
  );
  return admin ? (
    <AdminShell
      title={id ? "Order detail" : "Orders"}
      description="Review order snapshots and reservation status."
    >
      {body}
    </AdminShell>
  ) : (
    <main id="main-content" className="container order-page">
      <p className="eyebrow">IRANTI Africa</p>
      <h1>{id ? "Your order" : "Order history"}</h1>
      {body}
    </main>
  );
}
