"use client";
import { AdminTable, StatusBadge } from "@/components/admin/primitives";
import Link from "next/link";
import { InlineSpinner, PageSkeleton } from "@/components/loading";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/brand/layouts";
import { Button, Price, Modal } from "@/components/ui";
import { orderRequest } from "@/lib/order-api";
import { toast } from "@/lib/toast";
import type { Attempt } from "./payment-panel";
type AdminAttempt = Attempt & {
  order_id: string;
  order_number: string;
  checks: number;
  next_check_at: string | null;
  review_reason: string | null;
  financial_hold: boolean;
  receipts: {
    amount_minor: string;
    currency: string;
    channel: string;
    verified_at: string;
    applied_at: string | null;
    exception_code: string | null;
    verification_source: string;
  }[];
  history?: {
    source: string;
    outcome: string;
    status: string;
    created_at: string;
  }[];
};
function paymentDate(value: string | null) {
  if (!value) return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const withOffset = /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso;
  const timestamp = new Date(withOffset);
  if (Number.isNaN(timestamp.getTime())) return value;
  return `${new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(timestamp)} WAT`;
}
function paymentDay(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(timestamp);
}
function paymentEvent(event: NonNullable<AdminAttempt["history"]>[number]) {
  return event.outcome.replaceAll("_", " ").toLowerCase();
}
export function AdminPayments() {
  const { user, loading } = useAuth();
  const allowed =
    user?.authentication_state === "authenticated" &&
    (user.roles?.includes("owner") ?? false);
  const [rows, setRows] = useState<{
    user: string;
    items: AdminAttempt[];
    next_cursor: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const lock = useRef(false);
  const load = useCallback(
    async (cursor?: string) => {
      const generation = ++seq.current;
      try {
        const data = await orderRequest<{
          items: AdminAttempt[];
          next_cursor: string | null;
        }>(
          `/admin/payments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (generation === seq.current && user)
          setRows({ user: user.id, ...data });
      } catch (e) {
        if (generation === seq.current)
          setError(e instanceof Error ? e.message : "Unable to load payments.");
      }
    },
    [user],
  );
  const invalidate = useCallback(() => {
    seq.current++;
  }, []);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (live && allowed) void load();
    });
    return () => {
      live = false;
      invalidate();
    };
  }, [load, allowed, invalidate]);
  async function inspect(id: string, reconcile = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = seq.current;
    try {
      const data = await orderRequest<AdminAttempt>(
        `/admin/payments/${id}${reconcile ? "/reconcile" : ""}`,
        reconcile ? "POST" : "GET",
        reconcile ? {} : undefined,
      );
      if (generation === seq.current)
        setRows((r) =>
          r ? { ...r, items: r.items.map((a) => (a.id === id ? data : a)) } : r,
        );
      if (reconcile && generation === seq.current)
        toast.success("Payment review updated");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment could not be checked.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <AdminShell
      title="Payments"
      description="Verified receipts and reconciliation. Review flags do not authorize fulfilment or refunds."
    >
      {loading && <p role="status">Checking access…</p>}
      {!loading && !allowed && (
        <p>
          Owner permission and staff MFA are required.{" "}
          <Link href="/admin/orders">Order payment summaries</Link>
        </p>
      )}
      {error && !selected && <p role="alert">{error}</p>}
      {allowed && !rows && !error && (
        <PageSkeleton
          kind="admin-table"
          label="Loading payments"
          showHeading={false}
        />
      )}
      {allowed && rows?.user === user?.id && (
        <div className="admin-payments">
          <p className="admin-payments-intro" role="status">
            {rows?.items.length
              ? "Payment attempts, newest first."
              : "No payment attempts."}
          </p>
          <AdminTable
            label="Payments"
            columns={[
              "Reference",
              "Order / customer",
              "Amount",
              "Provider",
              "Status",
              "Created",
              "Action",
            ]}
            empty={rows.items.length === 0}
          >
            {rows.items.map((a) => (
              <tr key={a.id}>
                <th scope="row" className="admin-payment-reference-cell">
                  {a.reference}
                </th>
                <td>
                  <Link href={`/admin/orders/${a.order_id}`}>
                    {a.order_number}
                  </Link>
                  <small className="admin-cell-note">
                    Customer details in order
                  </small>
                </td>
                <td>
                  <Price value={a.amount_minor} />
                </td>
                <td>Paystack · {a.method}</td>
                <td>
                  <StatusBadge value={a.status} />
                  {(a.financial_hold || a.review_reason) && (
                    <p>
                      <StatusBadge
                        value="requires_review"
                        label="Review required"
                      />
                    </p>
                  )}
                </td>
                <td>{paymentDay(a.created_at)}</td>
                <td>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setSelected(a.id);
                      void inspect(a.id);
                    }}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </AdminTable>
          <Modal
            open={!!selected}
            onClose={() => {
              if (!busy) setSelected(null);
            }}
            title="Payment details"
            className="admin-payment-modal"
          >
            {rows.items
              .filter((a) => a.id === selected)
              .map((a) => (
                <div className="admin-payment-detail" key={a.id}>
                  <div className="admin-payment-summary">
                    <div>
                      <p className="eyebrow">Payment reference</p>
                      <p className="admin-payment-reference">{a.reference}</p>
                      <StatusBadge value={a.status} />
                    </div>
                    <div className="admin-payment-amount">
                      <span>Amount</span>
                      <strong>
                        <Price value={a.amount_minor} />
                      </strong>
                    </div>
                  </div>
                  <dl className="admin-payment-facts">
                    <div>
                      <dt>Order</dt>
                      <dd>
                        <Link href={`/admin/orders/${a.order_id}`}>
                          {a.order_number}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{paymentDate(a.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Last checked</dt>
                      <dd>{paymentDate(a.last_checked_at) ?? "Not checked"}</dd>
                    </div>
                    <div>
                      <dt>Next check</dt>
                      <dd>
                        {paymentDate(a.next_check_at) ??
                          "Manual review or final result"}
                      </dd>
                    </div>
                  </dl>
                  {(a.financial_hold || a.review_reason) && (
                    <section
                      className="admin-payment-review"
                      aria-label="Payment review"
                    >
                      <h3>Review required</h3>
                      {a.review_reason && (
                        <p>
                          Reason:{" "}
                          {a.review_reason.replaceAll("_", " ").toLowerCase()}
                        </p>
                      )}
                      {a.financial_hold && (
                        <p>
                          Financial hold is active. Review before fulfilment or
                          refunds.
                        </p>
                      )}
                    </section>
                  )}
                  {a.receipts.length > 0 && (
                    <section
                      className="admin-payment-receipts"
                      aria-label="Receipts"
                    >
                      <h3>Receipts</h3>
                      <ul>
                        {a.receipts.map((r, i) => (
                          <li key={i}>
                            <span>
                              <Price value={r.amount_minor} />
                            </span>
                            <span>
                              {r.applied_at
                                ? "Applied"
                                : "Unapplied — review required"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {error && (
                    <p className="admin-payment-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="admin-payment-actions">
                    <Button
                      loading={busy}
                      onClick={() => void inspect(a.id, true)}
                    >
                      {busy ? "Checking…" : "Verify with provider"}
                    </Button>
                  </div>
                  <section
                    className="admin-payment-history"
                    aria-labelledby="admin-payment-history-heading"
                  >
                    <div className="admin-payment-section-heading">
                      <h3 id="admin-payment-history-heading">History</h3>
                      {a.history && (
                        <span>
                          {a.history.length}{" "}
                          {a.history.length === 1 ? "event" : "events"}
                        </span>
                      )}
                    </div>
                    {!a.history ? (
                      <InlineSpinner label="Loading payment history…" />
                    ) : a.history.length === 0 ? (
                      <p>No payment events recorded.</p>
                    ) : (
                      <>
                        <ol className="admin-payment-event-list">
                          {a.history.slice(0, 4).map((h, i) => (
                            <li key={i}>
                              <div>
                                <strong>{paymentEvent(h)}</strong>
                                {h.status !== h.outcome && (
                                  <StatusBadge value={h.status} />
                                )}
                              </div>
                              <p className="admin-payment-event-meta">
                                <time dateTime={h.created_at}>
                                  {paymentDate(h.created_at)}
                                </time>
                                <span>
                                  {" "}
                                  ·{" "}
                                  {h.source.replaceAll("_", " ").toLowerCase()}
                                </span>
                              </p>
                            </li>
                          ))}
                        </ol>
                        {a.history.length > 4 && (
                          <details className="admin-payment-earlier">
                            <summary>
                              Show {a.history.length - 4} earlier events
                            </summary>
                            <ol className="admin-payment-event-list" start={5}>
                              {a.history.slice(4).map((h, i) => (
                                <li key={i}>
                                  <div>
                                    <strong>{paymentEvent(h)}</strong>
                                    {h.status !== h.outcome && (
                                      <StatusBadge value={h.status} />
                                    )}
                                  </div>
                                  <p className="admin-payment-event-meta">
                                    <time dateTime={h.created_at}>
                                      {paymentDate(h.created_at)}
                                    </time>
                                    <span>
                                      {" "}
                                      ·{" "}
                                      {h.source
                                        .replaceAll("_", " ")
                                        .toLowerCase()}
                                    </span>
                                  </p>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </>
                    )}
                  </section>
                </div>
              ))}
          </Modal>
          {rows?.next_cursor && (
            <Button onClick={() => void load(rows.next_cursor!)}>
              Next page
            </Button>
          )}
        </div>
      )}
    </AdminShell>
  );
}
