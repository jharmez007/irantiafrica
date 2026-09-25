"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/brand/layouts";
import { Button, Price } from "@/components/ui";
import { orderRequest } from "@/lib/order-api";
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
          <ul className="order-list">
            {rows?.items.map((a) => (
              <li className="order-card" key={a.id}>
                <h2>
                  <Link href={`/admin/orders/${a.order_id}`}>
                    {a.order_number}
                  </Link>
                </h2>
                <p>Reference: {a.reference}</p>
                <p>
                  {a.status} · {a.method} · <Price value={a.amount_minor} />
                </p>
                <p>
                  Created: {a.created_at} · Last checked:{" "}
                  {a.last_checked_at ?? "Not checked"}
                </p>
                <p>
                  Checks: {a.checks} · Next check:{" "}
                  {a.next_check_at ?? "Manual review or terminal result"}
                </p>
                {a.financial_hold && <p>Financial hold — review required.</p>}
                {a.review_reason && <p>Review: {a.review_reason}</p>}
                {a.receipts.map((r, i) => (
                  <p key={i}>
                    Receipt {r.currency} {r.amount_minor} minor units ·{" "}
                    {r.channel} ·{" "}
                    {r.applied_at ? "Applied" : "Unapplied — review required"} ·{" "}
                    {r.verification_source} · {r.verified_at}
                  </p>
                ))}
                <div className="order-actions">
                  <Button disabled={busy} onClick={() => void inspect(a.id)}>
                    View history
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void inspect(a.id, true)}
                  >
                    Verify with provider
                  </Button>
                </div>
                {a.history && (
                  <ul>
                    {a.history.map((h, i) => (
                      <li key={i}>
                        {h.created_at} · {h.source} · {h.outcome} · {h.status}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
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
