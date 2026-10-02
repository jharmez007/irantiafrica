"use client";
import { AdminTable, StatusBadge } from "@/components/admin/primitives";
import Link from "next/link";
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
      {error && <p role="alert">{error}</p>}
      {allowed && rows?.user === user?.id && (
        <>
          <p role="status">
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
                <th scope="row">{a.reference}</th>
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
                <td>{new Date(a.created_at).toLocaleDateString("en-NG")}</td>
                <td>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setSelected(a.id);
                      void inspect(a.id);
                    }}
                  >
                    View history
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
          >
            {rows.items
              .filter((a) => a.id === selected)
              .map((a) => (
                <div key={a.id}>
                  <p>Reference: {a.reference}</p>
                  <p>
                    <Link href={`/admin/orders/${a.order_id}`}>
                      {a.order_number}
                    </Link>
                  </p>
                  <p>
                    <StatusBadge value={a.status} /> ·{" "}
                    <Price value={a.amount_minor} />
                  </p>
                  {error && <p role="alert">{error}</p>}
                  {a.financial_hold && <p>Financial hold — review required.</p>}
                  {a.review_reason && (
                    <p>
                      Review:{" "}
                      {a.review_reason.replaceAll("_", " ").toLowerCase()}
                    </p>
                  )}
                  <p>Last checked: {a.last_checked_at ?? "Not checked"}</p>
                  <p>
                    Next check:{" "}
                    {a.next_check_at ?? "Manual review or final result"}
                  </p>
                  {a.receipts.map((r, i) => (
                    <p key={i}>
                      Receipt <Price value={r.amount_minor} /> ·{" "}
                      {r.applied_at ? "Applied" : "Unapplied — review required"}
                    </p>
                  ))}
                  <Button
                    disabled={busy}
                    onClick={() => void inspect(a.id, true)}
                  >
                    {busy ? "Checking…" : "Verify with provider"}
                  </Button>
                  <h3>History</h3>
                  {!a.history ? (
                    <p role="status">Loading payment history…</p>
                  ) : (
                    <ul>
                      {a.history.map((h, i) => (
                        <li key={i}>
                          {h.created_at} ·{" "}
                          {h.outcome.replaceAll("_", " ").toLowerCase()} ·{" "}
                          <StatusBadge value={h.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </Modal>
          {rows?.next_cursor && (
            <Button onClick={() => void load(rows.next_cursor!)}>
              Next page
            </Button>
          )}
        </>
      )}
    </AdminShell>
  );
}
