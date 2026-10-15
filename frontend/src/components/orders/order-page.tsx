"use client";
import { AdminTable, StatusBadge } from "@/components/admin/primitives";
import Link from "next/link";
import { PageSkeleton } from "@/components/loading";
import { FulfilmentPanel } from "./fulfilment-panel";
import { CustomerOrderDetail } from "./customer-order-detail";
import { paymentMessage } from "@/components/payments/payment-panel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/brand/layouts";
import { toast } from "@/lib/toast";
import { Button, Price } from "@/components/ui";
import { ProductImage } from "@/components/catalog/product-image";
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
        toast.success(admin ? "Order transition recorded" : "Order cancelled");
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
      {!admin && !id && (
        <nav aria-label="Order navigation" className="order-navigation">
          <Link href={admin ? "/admin" : "/account"}>
            {admin ? "Staff workspace" : "Your account"}
          </Link>
          {id && !guest && <Link href={route}>Order history</Link>}
          <Link href="/products">The collection</Link>
        </nav>
      )}
      {!guest && !user && !authLoading && (
        <p>
          <Link href="/login">Sign in to view your orders.</Link>
        </p>
      )}
      {loading && (
        <PageSkeleton
          kind={admin ? (id ? "admin-editor" : "admin-table") : "account"}
          label="Loading orders"
          showHeading={false}
        />
      )}
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
          {admin ? (
            <AdminTable
              label="Orders"
              columns={[
                "Order",
                "Customer",
                "Date",
                "Total",
                "Payment",
                "Fulfilment",
                "Status",
                "Actions",
              ]}
              empty={list.items.length === 0}
            >
              {list.items.map((o) => (
                <tr key={o.id}>
                  <th scope="row">
                    <Link href={`${route}/${o.id}`}>{o.number}</Link>
                  </th>
                  <td>
                    {o.contact?.email ??
                      (o.ownership === "guest"
                        ? "Guest · details in order"
                        : "Account · details in order")}
                  </td>
                  <td>{date(o.created_at)} WAT</td>
                  <td>
                    <Price value={o.total_minor} />
                  </td>
                  <td>
                    <StatusBadge value={o.payment.state} />
                  </td>
                  <td>
                    {o.shipment ? (
                      <StatusBadge value={o.shipment.status} />
                    ) : ["PROCESSING", "SHIPPED", "DELIVERED"].includes(
                        o.status,
                      ) ? (
                      <StatusBadge value={o.status} />
                    ) : (
                      "Not started"
                    )}
                  </td>
                  <td>
                    <StatusBadge value={o.status} />
                  </td>
                  <td>
                    <Link
                      className="button button--secondary"
                      href={`${route}/${o.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : (
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
          )}
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
      {order && !admin && (
        <CustomerOrderDetail
          order={order}
          scope={scope}
          guest={guest}
          paymentReturn={paymentReturn}
          reload={reload}
          changed={(data) => {
            sequence.current++;
            setResult({ scope, data });
          }}
        />
      )}
      {order && admin && (
        <article className="order-detail admin-order-detail">
          <header className="admin-order-header">
            <div className="admin-order-header-main">
              <div>
                <p className="eyebrow">Order reference</p>
                <h2 className="order-reference">{order.number}</h2>
                <p>Placed {date(order.created_at)} WAT</p>
              </div>
              <StatusBadge value={order.status} />
            </div>
            <dl className="admin-order-status-grid">
              <div>
                <dt>Payment</dt>
                <dd>
                  <StatusBadge value={order.payment.state} />
                </dd>
              </div>
              <div>
                <dt>Stock reservation</dt>
                <dd>
                  <StatusBadge value={order.reservation.status} />
                  {order.reservation.status === "ACTIVE" && (
                    <small>
                      Until {date(order.reservation.expires_at)} WAT
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>{order.item_count}</dd>
              </div>
            </dl>
            {(order.status === "CANCELLED" ||
              order.payment.state !== "SUCCESSFUL") && (
              <div
                className="admin-order-notice"
                role="status"
                tabIndex={-1}
                ref={error ? undefined : focus}
              >
                {order.status === "CANCELLED"
                  ? "This order is cancelled."
                  : paymentMessage(order.payment.state, order.status)}
              </div>
            )}
            {!order.reservation.eligible &&
              order.status === "PENDING_PAYMENT" && (
                <p className="admin-order-notice">
                  This order cannot proceed with its current reservation. Stock
                  must be reviewed before a future payment attempt.
                </p>
              )}
          </header>
          <nav className="admin-order-links" aria-label="Related order records">
            <Link href="/admin/orders">← All orders</Link>
            {user?.authentication_state === "authenticated" &&
              user.roles?.includes("owner") && (
                <Link href="/admin/payments">Payment records</Link>
              )}
            <Link href="/admin/returns">Returns and refunds</Link>
          </nav>
          <div className="order-columns admin-order-overview">
            <div className="admin-order-primary">
              <section
                className="admin-order-items-card"
                aria-labelledby="order-items-heading"
              >
                <div className="admin-order-section-heading">
                  <h2 id="order-items-heading">Items</h2>
                  <span>
                    {order.item_count}{" "}
                    {order.item_count === 1 ? "item" : "items"}
                  </span>
                </div>
                <ul className="admin-order-item-list">
                  {order.lines?.map((line) => (
                    <li className="admin-order-item" key={line.id}>
                      <div className="admin-order-item-image">
                        <ProductImage
                          image={line.snapshot.image ?? undefined}
                          sizes="80px"
                        />
                      </div>
                      <div className="admin-order-item-info">
                        <h3>{line.snapshot.name}</h3>
                        {line.snapshot.options.length > 0 && (
                          <p>{line.snapshot.options.join(" · ")}</p>
                        )}
                        {line.snapshot.sku && <p>SKU {line.snapshot.sku}</p>}
                        <p>
                          Qty {line.quantity} ×{" "}
                          <Price value={line.unit_price_minor} />
                        </p>
                      </div>
                      <div className="admin-order-item-amount">
                        <span>Line total</span>
                        <strong>
                          <Price value={line.line_total_minor} />
                        </strong>
                        <small>
                          Includes <Price value={line.tax_minor} /> tax
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              {order.contact && (
                <section
                  className="admin-order-delivery-card"
                  aria-labelledby="order-delivery-heading"
                >
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
            </div>
            <section
              className="order-summary admin-order-summary"
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
              <p>Historical order amounts</p>
            </section>
          </div>
          <FulfilmentPanel
            key={scope}
            order={order}
            admin={admin}
            changed={(data) => {
              sequence.current++;
              setResult({ scope, data });
            }}
          />
          {order.can_cancel && (
            <form onSubmit={(e) => void cancel(e)} className="order-cancel">
              <label>
                Cancellation reason
                <textarea
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <p>
                Cancel this unpaid order and release any remaining stock hold.
                Order history is retained.
              </p>
              <Button variant="secondary" disabled={busy}>
                {busy ? "Cancelling…" : "Cancel unpaid order"}
              </Button>
            </form>
          )}
          <details className="admin-order-history">
            <summary>Status history</summary>
            <ol>
              {order.history?.map((h, i) => (
                <li key={i}>
                  {label(h.status)} · {date(h.at)} WAT
                </li>
              ))}
            </ol>
          </details>
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
    <main
      id="main-content"
      className={`container order-page${id ? " order-page--detail" : ""}`}
    >
      {(!id || !order) && (
        <>
          <p className="eyebrow">IRANTI Africa</p>
          <h1>{id ? "Order details" : "Order history"}</h1>
        </>
      )}
      {body}
    </main>
  );
}
