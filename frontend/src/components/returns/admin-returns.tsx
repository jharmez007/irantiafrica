"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/brand/layouts";
import { Button } from "@/components/ui";
import { ReturnSummary } from "./returns-panel";
import { returnRequest, type ReturnRecord } from "@/lib/returns-api";

function Review({
  record,
  changed,
}: {
  record: ReturnRecord;
  changed: (r: ReturnRecord) => void;
}) {
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  useEffect(() => {
    if (!reauthenticated) return;
    const timer = setTimeout(() => setReauthenticated(false), 290000);
    return () => clearTimeout(timer);
  }, [reauthenticated]);
  const [providerId, setProviderId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (error || notice) feedback.current?.focus();
  }, [error, notice]);
  const labels: Record<string, string> = {
    review: "Start review",
    approve: "Approve return",
    reject: "Reject return",
    receive: "Confirm physical receipt",
    inspect: "Record inspection",
    restock: "Restock saleable units",
    refund: "Approve refund",
    submit: "Submit refund to provider",
    reconcile: "Verify refund status",
  };
  const allowed = { ...record.actions, ...record.refund_actions };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || !allowed[action]) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        ["refund", "submit", "reconcile"].includes(action) &&
        !reauthenticated
      ) {
        await returnRequest("/auth/reauthenticate", "POST", { password, code });
        if (alive.current) {
          setPassword("");
          setCode("");
          setReauthenticated(true);
        }
      }
      const path =
        action === "refund"
          ? "refund/approve"
          : ["submit", "reconcile"].includes(action)
            ? `refund/${action}`
            : action;
      const payload: Record<string, unknown> = ["submit", "reconcile"].includes(
        action,
      )
        ? action === "reconcile" && providerId
          ? { provider_refund_id: providerId }
          : {}
        : { expected_version: record.version, note };
      if (action === "approve")
        payload.items = record.items.map((i) => ({
          return_item_id: i.id,
          quantity: quantities[i.id] ?? i.quantity,
        }));
      if (action === "inspect")
        payload.items = record.items
          .filter((i) => i.approved_quantity > 0)
          .map((i) => ({
            return_item_id: i.id,
            disposition: dispositions[i.id] ?? "QUARANTINED",
          }));
      const next = await returnRequest<ReturnRecord>(
        `/admin/returns/${record.id}/${path}`,
        "POST",
        payload,
      );
      if (alive.current) {
        changed(next);
        setAction("");
        setNotice("Action recorded. Review the updated return summary.");
      }
    } catch (e) {
      if (alive.current) setReauthenticated(false);
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Action failed. Refresh and review before retrying.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <article className="return-record">
      <Link href={`/admin/orders/${record.order_id}`}>View original order</Link>
      <p>Requester: {record.requester}</p>
      <ReturnSummary record={record} />
      <div
        ref={feedback}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        id={`feedback-${record.id}`}
      >
        {error || notice}
      </div>
      <form
        method="post"
        className="return-form"
        onSubmit={submit}
        aria-describedby={`feedback-${record.id}`}
      >
        <fieldset disabled={busy}>
          <legend>Authorized actions</legend>
          <label className="return-field">
            Action
            <select
              className="input"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              required
            >
              <option value="">Choose an action</option>
              {Object.entries(allowed)
                .filter(([, enabled]) => enabled)
                .map(([key]) => (
                  <option key={key} value={key}>
                    {labels[key]}
                  </option>
                ))}
            </select>
          </label>
          {action && (
            <>
              {action === "approve" &&
                record.items.map((i) => (
                  <label className="return-field" key={i.id}>
                    Approved quantity — {i.name}
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={i.quantity}
                      step={1}
                      value={quantities[i.id] ?? i.quantity}
                      onChange={(e) =>
                        setQuantities({
                          ...quantities,
                          [i.id]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              {action === "inspect" &&
                record.items
                  .filter((i) => i.approved_quantity > 0)
                  .map((i) => (
                    <label className="return-field" key={i.id}>
                      Disposition — {i.name}
                      <select
                        className="input"
                        value={dispositions[i.id] ?? "QUARANTINED"}
                        onChange={(e) =>
                          setDispositions({
                            ...dispositions,
                            [i.id]: e.target.value,
                          })
                        }
                      >
                        <option value="QUARANTINED">Quarantined</option>
                        <option value="SALEABLE">
                          Saleable after inspection
                        </option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="DISPOSED">Disposed</option>
                      </select>
                    </label>
                  ))}
              {!["submit", "reconcile"].includes(action) && (
                <label className="return-field">
                  Decision / operational note
                  <textarea
                    className="input textarea"
                    required
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              )}
              {["refund", "submit", "reconcile"].includes(action) &&
                !reauthenticated && (
                  <>
                    <label className="return-field">
                      Confirm your password
                      <input
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <label className="return-field">
                      New authenticator code
                      <input
                        className="input"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        minLength={6}
                        maxLength={6}
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        aria-describedby={`feedback-${record.id}`}
                      />
                      <span>
                        Use a fresh six-digit code that has not already been
                        used to sign in.
                      </span>
                    </label>
                  </>
                )}
              {["refund", "submit", "reconcile"].includes(action) &&
                reauthenticated && (
                  <p>
                    Recent authentication confirmed. The server rechecks your
                    permission before every action.
                  </p>
                )}
              {action === "reconcile" && (
                <label className="return-field">
                  Provider refund ID (only for an unlinked refund)
                  <input
                    className="input"
                    inputMode="numeric"
                    pattern="[1-9][0-9]{0,19}"
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                  />
                  <span>
                    Verified by the server against the original payment, amount
                    and internal reference.
                  </span>
                </label>
              )}
              <p>
                {action === "receive"
                  ? "Confirm all approved units have physically arrived."
                  : action === "restock"
                    ? "Only inspected saleable units will be added to stock."
                    : action === "submit"
                      ? "This sends the approved refund to the payment provider. The amount is calculated by the server."
                      : "Confirm this action for the return shown above."}
              </p>
              <Button type="submit">
                {busy ? "Recording…" : `Confirm: ${labels[action]}`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAction("")}
              >
                Cancel action
              </Button>
            </>
          )}
        </fieldset>
      </form>
    </article>
  );
}
export function AdminReturns() {
  const { user, loading } = useAuth();
  return (
    <AdminShell
      title="Returns & refunds"
      description="Review requested items, record physical receipt and inspection, and approve refunds."
    >
      {loading ? (
        <p role="status">Checking access…</p>
      ) : !user || user.authentication_state !== "authenticated" ? (
        <p>
          Sign in with staff MFA to review returns.{" "}
          <Link href="/login">Sign in</Link>
        </p>
      ) : (
        <ReturnQueue key={user.id} />
      )}
    </AdminShell>
  );
}
export function ReturnQueue() {
  const [rows, setRows] = useState<ReturnRecord[] | null>(null);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    returnRequest<{ returns: ReturnRecord[]; last_page: number }>(
      `/admin/returns?page=${page}`,
    )
      .then((d) => {
        if (alive) {
          setRows(d.returns);
          setLast(d.last_page);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) {
          setRows(null);
          setError(e instanceof Error ? e.message : "Unable to load returns.");
        }
      });
    return () => {
      alive = false;
    };
  }, [page, revision]);
  return (
    <div className="returns-panel">
      <Button onClick={() => setRevision((r) => r + 1)}>Refresh returns</Button>
      {error && <p role="alert">{error}</p>}
      {!rows && !error && <p role="status">Loading returns…</p>}
      {rows?.length === 0 && <p>No return requests.</p>}
      {rows?.map((r) => (
        <Review
          key={r.id}
          record={r}
          changed={(next) =>
            setRows(
              (previous) =>
                previous?.map((p) => (p.id === next.id ? next : p)) ?? null,
            )
          }
        />
      ))}
      <nav aria-label="Return queue pages">
        <Button
          disabled={page <= 1}
          onClick={() => {
            setRows(null);
            setPage((p) => p - 1);
          }}
        >
          Previous page
        </Button>
        <span>
          Page {page} of {last}
        </span>
        <Button
          disabled={page >= last}
          onClick={() => {
            setRows(null);
            setPage((p) => p + 1);
          }}
        >
          Next page
        </Button>
      </nav>
    </div>
  );
}
