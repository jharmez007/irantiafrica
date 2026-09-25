"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/brand/layouts";
import { Button, Input, Select } from "@/components/ui";
import { orderRequest } from "@/lib/order-api";

type Row = Record<string, string | number | boolean | null>;
type Counts = { status: string; count: number }[];
type Page = { page: number; last_page: number; total: number };
type Items = { items: Row[]; pagination: Page; scope: string };
export type Dashboard = {
  range: { from: string; to: string; timezone: string };
  as_of: string;
  sales?: {
    values: Record<string, string | number>;
    formatted: Record<string, string>;
    unapplied_receipts: number;
    daily: Row[];
    definition: string;
  };
  orders?: Items & { counts: Record<string, number>; current_backlog: Counts };
  stock?: Items & { counts: Record<string, number>; recent_adjustments: Row[] };
  products?: Items;
  payments?: {
    scope: string;
    counts: Counts;
    issues: Row[];
    reconciliation_needed: number;
  };
  returns?: {
    scope: string;
    counts: Counts;
    open_count: number;
    queue: Row[];
    refund_counts?: Counts;
    refund_queue?: Row[];
  };
  notifications?: {
    scope: string;
    enabled: boolean;
    counts: Counts;
    pending_retry: number;
  };
};
const human = (value: string) => value.replaceAll("_", " ").toLowerCase();
function Table({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Row[];
  columns: [string, string][];
}) {
  return rows.length ? (
    <div className="report-table" role="region" aria-label={title} tabIndex={0}>
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th scope="col" key={key}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(([key]) => (
                <td key={key}>
                  {row[key] === null || row[key] === undefined
                    ? "Not configured"
                    : String(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="report-empty">No {title.toLowerCase()} to show.</p>
  );
}
function Status({ title, counts }: { title: string; counts: Counts }) {
  return (
    <Table
      title={title}
      rows={counts}
      columns={[
        ["status", "Current status"],
        ["count", "Count"],
      ]}
    />
  );
}
function Card({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="report-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AdminDashboard() {
  const { user, loading } = useAuth();
  const permissions = user?.permissions ?? [];
  const available = [
    ...[
      ["orders", "Orders", "reports.orders"],
      ["stock", "Inventory", "reports.stock"],
      ["sales", "Sales", "reports.sales"],
      ["products", "Products", "reports.products"],
    ].filter(([, , p]) => permissions.includes(p)),
  ];
  const allowed =
    user?.authentication_state === "authenticated" && available.length > 0;
  const scopeKey = `${user?.id ?? ""}:${permissions.join(",")}`;
  const [selection, setSelection] = useState("dashboard");
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stock, setStock] = useState("all");
  const [query, setQuery] = useState({
    range: "30d",
    from: "",
    to: "",
    stock: "all",
    page: 1,
    report: "dashboard",
  });
  const [result, setResult] = useState<{
    scope: string;
    data: Dashboard;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current;
    let live = true;
    queueMicrotask(() => {
      if (live) {
        setResult(null);
        setError("");
        setBusy(!!allowed);
      }
    });
    if (allowed) {
      const params = new URLSearchParams({
        range: query.range,
        page: String(query.page),
        stock: query.stock,
      });
      if (query.range === "custom") {
        params.set("from", query.from);
        params.set("to", query.to);
      }
      const route =
        query.report === "dashboard"
          ? "/admin/dashboard"
          : `/admin/reports/${query.report}`;
      orderRequest<Dashboard>(`${route}?${params}`)
        .then((data) => {
          if (live && generation.current === id) {
            setResult({ scope: scopeKey, data });
            setBusy(false);
          }
        })
        .catch((e: unknown) => {
          if (live && generation.current === id) {
            setError(
              e instanceof Error ? e.message : "Unable to load reports.",
            );
            setBusy(false);
          }
        });
    }
    return () => {
      live = false;
    };
  }, [allowed, scopeKey, query, reload]);
  const data = allowed && result?.scope === scopeKey ? result.data : null;
  const paged =
    data && query.report !== "dashboard"
      ? data[query.report as "orders" | "stock" | "products"]
      : null;
  const page = paged && "pagination" in paged ? paged.pagination : null;
  return (
    <AdminShell
      title="Operational dashboard"
      description="Basic sales, order and stock reporting for your role."
    >
      {loading ? (
        <p role="status">Checking staff access…</p>
      ) : !allowed ? (
        <p role="alert">
          Sign in with an authorized staff account and complete MFA to view
          reports.
        </p>
      ) : (
        <>
          <nav className="report-links" aria-label="Operational tools">
            <Link href="/admin/catalog">Catalog</Link>
            {permissions.includes("orders.read") && (
              <Link href="/admin/orders">Orders</Link>
            )}
            {permissions.includes("reports.stock") && (
              <Link href="/admin/inventory">Inventory</Link>
            )}
            {permissions.includes("payments.reconcile") && (
              <Link href="/admin/payments">Payment issues</Link>
            )}
            {permissions.includes("returns.read") && (
              <Link href="/admin/returns">Returns</Link>
            )}
          </nav>
          <form
            className="report-filters admin-panel"
            aria-describedby="report-dates"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({
                range,
                from,
                to,
                stock,
                page: 1,
                report: selection,
              });
            }}
          >
            <label>
              Report
              <Select
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
              >
                <option value="dashboard">Overview</option>
                {available.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Date range
              <Select
                value={range}
                onChange={(e) => {
                  setRange(e.target.value);
                  if (e.target.value === "custom") {
                    setFrom(from || data?.range.from || "");
                    setTo(to || data?.range.to || "");
                  }
                }}
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom range</option>
              </Select>
            </label>
            {range === "custom" && (
              <>
                <label>
                  From
                  <Input
                    type="date"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <Input
                    type="date"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
            {permissions.includes("reports.stock") && (
              <label>
                Stock rows
                <Select
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                >
                  <option value="all">All active variants</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                  <option value="uninitialized">Not initialized</option>
                </Select>
              </label>
            )}
            <Button disabled={busy}>Apply filters</Button>
            <p id="report-dates">
              Calendar days in Africa/Lagos; custom ranges are limited to 366
              days. Inventory and current queues are live snapshots.
            </p>
          </form>
          {busy && <p role="status">Loading operational reports…</p>}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <Button type="button" onClick={() => setReload((v) => v + 1)}>
                Retry reports
              </Button>
            </div>
          )}
          {data && (
            <div className="report-sections">
              <p>
                Period: {data.range.from} – {data.range.to} (
                {data.range.timezone}). Read at {data.as_of}. Each section
                states its date basis.
              </p>
              {data.sales && (
                <section
                  className="admin-panel"
                  aria-labelledby="sales-heading"
                >
                  <h2 id="sales-heading">Sales and collections</h2>
                  <p>{data.sales.definition}</p>
                  <div className="report-cards">
                    <Card
                      label="Gross paid receipts"
                      value={data.sales.formatted.gross_minor}
                    />
                    <Card
                      label="Successful refunds"
                      value={data.sales.formatted.refunded_minor}
                    />
                    <Card
                      label="Net collections"
                      value={data.sales.formatted.net_minor}
                    />
                    <Card
                      label="Paid orders"
                      value={data.sales.values.paid_orders}
                    />
                    <Card
                      label="Item value (excluding tax)"
                      value={data.sales.formatted.items_minor}
                    />
                    <Card
                      label="Delivery (excluding tax)"
                      value={data.sales.formatted.delivery_minor}
                    />
                    <Card
                      label="Tax collected"
                      value={data.sales.formatted.tax_minor}
                    />
                    <Card
                      label="Included receipts on financial hold"
                      value={data.sales.formatted.held_minor}
                    />
                    <Card
                      label="Unapplied receipts excluded"
                      value={data.sales.unapplied_receipts}
                    />
                  </div>
                  <details>
                    <summary>Daily paid receipts</summary>
                    <Table
                      title="Daily paid receipts (days with receipts)"
                      rows={data.sales.daily}
                      columns={[
                        ["day", "Business day"],
                        ["paid_orders", "Paid orders"],
                        ["gross", "Gross paid receipts"],
                      ]}
                    />
                  </details>
                </section>
              )}
              {data.orders && (
                <section
                  className="admin-panel"
                  aria-labelledby="orders-heading"
                >
                  <h2 id="orders-heading">Orders and fulfilment</h2>
                  <p>{data.orders.scope}</p>
                  <div className="report-cards">
                    {Object.entries(data.orders.counts).map(([s, n]) => (
                      <Card key={s} label={human(s)} value={n} />
                    ))}
                  </div>
                  <Status
                    title="Current backlog (all dates)"
                    counts={data.orders.current_backlog}
                  />
                  <Table
                    title="Recent orders"
                    rows={data.orders.items}
                    columns={[
                      ["public_reference", "Order"],
                      ["status", "Status"],
                      ["payment_state", "Payment state"],
                      ["created_at", "Created (UTC)"],
                    ]}
                  />
                </section>
              )}
              {data.stock && (
                <section
                  className="admin-panel"
                  aria-labelledby="stock-heading"
                >
                  <h2 id="stock-heading">Inventory</h2>
                  <p>
                    {data.stock.scope}. Low stock includes zero availability and
                    uses each variant’s threshold.
                  </p>
                  <div className="report-cards">
                    <Card
                      label="Low-stock variants"
                      value={data.stock.counts.low_stock}
                    />
                    <Card
                      label="Out-of-stock variants"
                      value={data.stock.counts.out_of_stock}
                    />
                    <Card
                      label="Stock not initialized"
                      value={data.stock.counts.uninitialized}
                    />
                  </div>
                  <Table
                    title="Variant stock"
                    rows={data.stock.items}
                    columns={[
                      ["sku", "SKU"],
                      ["product_name", "Product"],
                      ["on_hand", "On hand"],
                      ["reserved", "Reserved"],
                      ["available_quantity", "Available"],
                      ["low_stock_threshold", "Threshold"],
                    ]}
                  />
                  <Table
                    title="Recent adjustments (all dates)"
                    rows={data.stock.recent_adjustments}
                    columns={[
                      ["variant_id", "Variant"],
                      ["kind", "Movement"],
                      ["on_hand_delta", "On-hand change"],
                      ["created_at", "Recorded (UTC)"],
                    ]}
                  />
                </section>
              )}
              {data.products && (
                <section
                  className="admin-panel"
                  aria-labelledby="products-heading"
                >
                  <h2 id="products-heading">Basic product performance</h2>
                  <p>{data.products.scope}</p>
                  <Table
                    title="Product performance"
                    rows={data.products.items}
                    columns={[
                      ["name", "Historical name"],
                      ["sku", "Historical SKU"],
                      ["units", "Units sold"],
                      ["gross", "Paid item value"],
                      ["refunded_units", "Refunded units"],
                      ["refunded_base", "Refunded item value"],
                      ["refunded_tax", "Refunded item tax"],
                    ]}
                  />
                </section>
              )}
              {data.payments && (
                <section className="admin-panel">
                  <h2>Payment operations</h2>
                  <p>{data.payments.scope}</p>
                  <p>
                    Attempts needing reconciliation:{" "}
                    {data.payments.reconciliation_needed}
                  </p>
                  <Status
                    title="Payment attempts"
                    counts={data.payments.counts}
                  />
                  <Table
                    title="Recent payment issues"
                    rows={data.payments.issues}
                    columns={[
                      ["order_id", "Order"],
                      ["status", "Attempt state"],
                      ["created_at", "Created (UTC)"],
                    ]}
                  />
                </section>
              )}
              {data.returns && (
                <section className="admin-panel">
                  <h2>Returns and refunds</h2>
                  <p>{data.returns.scope}</p>
                  <p>Open requests (all dates): {data.returns.open_count}</p>
                  <Status
                    title="Return requests"
                    counts={data.returns.counts}
                  />
                  <Table
                    title="Open return queue"
                    rows={data.returns.queue}
                    columns={[
                      ["order_id", "Order"],
                      ["status", "Status"],
                      ["submitted_at", "Submitted (UTC)"],
                    ]}
                  />
                  {data.returns.refund_counts && (
                    <Status
                      title="Refunds created in range"
                      counts={data.returns.refund_counts}
                    />
                  )}{" "}
                  {data.returns.refund_queue && (
                    <Table
                      title="Refund follow-up queue (all dates)"
                      rows={data.returns.refund_queue}
                      columns={[
                        ["order_id", "Order"],
                        ["status", "Status"],
                        ["created_at", "Created (UTC)"],
                      ]}
                    />
                  )}
                </section>
              )}
              {data.notifications && (
                <section className="admin-panel">
                  <h2>Transactional notification health</h2>
                  <p>{data.notifications.scope}</p>
                  <p>
                    Delivery{" "}
                    {data.notifications.enabled ? "enabled" : "disabled"} ·
                    Pending retries: {data.notifications.pending_retry}
                  </p>
                  <Status
                    title="Notification outcomes"
                    counts={data.notifications.counts}
                  />
                  <p>
                    SIMULATED means local testing; SENT means transport
                    acceptance, not inbox delivery.
                  </p>
                </section>
              )}
              {page && (
                <nav className="report-links" aria-label="Report pages">
                  <Button
                    disabled={page.page <= 1 || busy}
                    onClick={() =>
                      setQuery((q) => ({ ...q, page: q.page - 1 }))
                    }
                  >
                    Previous page
                  </Button>
                  <span>
                    Page {page.page} of {page.last_page} · {page.total} rows
                  </span>
                  <Button
                    disabled={page.page >= page.last_page || busy}
                    onClick={() =>
                      setQuery((q) => ({ ...q, page: q.page + 1 }))
                    }
                  >
                    Next page
                  </Button>
                </nav>
              )}
              {query.report === "dashboard" && (
                <p>
                  Overview lists show up to 25 rows; operational queues show up
                  to 10. Select Orders, Inventory or Products above to browse
                  paginated detail. Counts and totals include the entire stated
                  scope.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
