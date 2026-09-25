"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Price } from "@/components/ui";
import { type OrderRecord } from "@/lib/order-api";
import {
  returnRequest,
  reasonLabels,
  returnLabel,
  type ReturnList,
  type ReturnRecord,
} from "@/lib/returns-api";

export function ReturnSummary({ record }: { record: ReturnRecord }) {
  return (
    <section className="return-record" aria-label="Return summary">
      <h3>Return · {returnLabel(record.status)}</h3>
      <p>
        {reasonLabels[record.reason_code]} · Requested{" "}
        {new Date(record.submitted_at).toLocaleString("en-NG")}
      </p>
      {record.explanation && <p>{record.explanation}</p>}
      <ul>
        {record.items.map((item) => (
          <li key={item.id}>
            <strong>{item.name}</strong>
            <p>
              Requested {item.quantity} · Approved {item.approved_quantity} ·
              Received {item.received_quantity} · Restocked{" "}
              {item.restocked_quantity}
            </p>
            {item.disposition && (
              <p>Inspection: {returnLabel(item.disposition)}</p>
            )}
          </li>
        ))}
      </ul>
      {record.decision_reason && <p>Decision: {record.decision_reason}</p>}
      {record.refund && (
        <p role="status">
          Refund: {returnLabel(record.refund.status)} ·{" "}
          <Price value={record.refund.amount_minor} />
          {record.refund.status === "UNKNOWN" &&
            " · Provider verification requires staff review."}
        </p>
      )}
      {record.payment_summary && (
        <div className="return-payment-summary">
          <p>
            Payment: {returnLabel(record.payment_summary.state)}
            {record.payment_summary.financial_hold &&
              " · Financial review required"}
          </p>
          <p>
            Original captured:{" "}
            <Price value={record.payment_summary.captured_minor} /> · Refunded:{" "}
            <Price value={record.payment_summary.refunded_minor} />
          </p>
          <p>
            Refund budget reserved:{" "}
            <Price value={record.payment_summary.reserved_minor} /> · Net
            collected: <Price value={record.payment_summary.net_minor} />
          </p>
        </div>
      )}
      <details>
        <summary>Return history</summary>
        <ol>
          {record.history.map((h, i) => (
            <li key={i}>
              {h.event.replace(/([a-z])([A-Z])/g, "$1 $2")} ·{" "}
              {new Date(
                h.at ?? h.created_at ?? record.submitted_at,
              ).toLocaleString("en-NG")}
              {h.note && <p>{h.note}</p>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function ReturnsPanel({ order }: { order: OrderRecord }) {
  const [data, setData] = useState<ReturnList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("DAMAGED_PRODUCT");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const lock = useRef(false);
  const key = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    returnRequest<ReturnList>(`/orders/${order.id}/returns`)
      .then((d) => {
        if (alive.current) setData(d);
      })
      .catch((e) => {
        if (alive.current)
          setError(e instanceof Error ? e.message : "Returns unavailable.");
      });
    return () => {
      alive.current = false;
    };
  }, [order.id]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    if (!items.length) {
      setError("Select at least one item and quantity.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    key.current ??= crypto.randomUUID();
    try {
      await returnRequest(
        `/orders/${order.id}/returns`,
        "POST",
        { reason_code: reason, explanation: explanation || null, items },
        key.current,
      );
      const next = await returnRequest<ReturnList>(
        `/orders/${order.id}/returns`,
      );
      if (alive.current) {
        setData(next);
        setQuantities({});
        setExplanation("");
        key.current = null;
        setNotice("Return requested. Staff will review the selected items.");
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unable to request return.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="returns-panel" aria-labelledby="returns-heading">
      <h2 id="returns-heading">Returns & refunds</h2>
      <div ref={errorRef} tabIndex={-1} role="alert" id="return-error">
        {error}
      </div>
      <p role="status">{notice}</p>
      {!data && !error && <p role="status">Loading return eligibility…</p>}
      {!data && error && (
        <Button
          onClick={() => {
            setError("");
            returnRequest<ReturnList>(`/orders/${order.id}/returns`)
              .then((d) => {
                if (alive.current) setData(d);
              })
              .catch((e) => {
                if (alive.current) setError(e.message);
              });
          }}
        >
          Retry returns
        </Button>
      )}
      {data && (
        <>
          <p>{data.eligibility.reason}</p>
          {data.eligibility.cutoff && (
            <p>
              Request before{" "}
              {new Date(data.eligibility.cutoff).toLocaleString("en-NG")} (your
              local time).
            </p>
          )}
          {data.eligibility.eligible &&
            data.items.some((i) => i.available_quantity > 0) && (
              <form
                method="post"
                onSubmit={submit}
                aria-describedby={error ? "return-error" : undefined}
                className="return-form"
              >
                <fieldset disabled={busy}>
                  <legend>Select items to return</legend>
                  <p>
                    Choose 0 to leave an item out. Delivery charges are excluded
                    from refunds.
                  </p>
                  {data.items
                    .filter((i) => i.available_quantity > 0)
                    .map((item) => (
                      <label key={item.order_item_id} className="return-field">
                        {order.lines?.find((l) => l.id === item.order_item_id)
                          ?.snapshot.name ?? "Order item"}{" "}
                        — quantity (up to {item.available_quantity})
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={item.available_quantity}
                          step={1}
                          value={quantities[item.order_item_id] ?? 0}
                          onChange={(e) => {
                            key.current = null;
                            setQuantities({
                              ...quantities,
                              [item.order_item_id]: Number(e.target.value),
                            });
                          }}
                          aria-describedby={error ? "return-error" : undefined}
                        />
                      </label>
                    ))}
                  <label className="return-field">
                    Reason
                    <select
                      className="input"
                      value={reason}
                      onChange={(e) => {
                        key.current = null;
                        setReason(e.target.value);
                      }}
                    >
                      {data.reasons.map((r) => (
                        <option key={r} value={r}>
                          {reasonLabels[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="return-field">
                    Explanation (optional)
                    <textarea
                      className="input textarea"
                      maxLength={2000}
                      value={explanation}
                      onChange={(e) => {
                        key.current = null;
                        setExplanation(e.target.value);
                      }}
                    />
                  </label>
                  <Button type="submit">
                    {busy ? "Submitting…" : "Request return"}
                  </Button>
                </fieldset>
              </form>
            )}
          {data.returns.length === 0 && (
            <p>No return requests for this order.</p>
          )}
          {data.returns.map((r) => (
            <ReturnSummary key={r.id} record={r} />
          ))}
        </>
      )}
    </section>
  );
}
