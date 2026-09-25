"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckoutError } from "@/lib/checkout-api";
import { Button } from "@/components/ui";
import { orderRequest, type OrderRecord, type Shipment } from "@/lib/order-api";

function safeLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
function time(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}
function Tracking({ shipment }: { shipment: Shipment | null | undefined }) {
  if (!shipment) return <p>Tracking details will appear after dispatch.</p>;
  const url = safeLink(shipment.tracking_url);
  return (
    <dl className="shipment-details">
      <div>
        <dt>Shipment status</dt>
        <dd>
          {shipment.status === "PREPARED"
            ? "Prepared for dispatch"
            : shipment.status === "SHIPPED"
              ? "Shipped"
              : "Delivered"}
        </dd>
      </div>
      <div>
        <dt>Carrier</dt>
        <dd>{shipment.provider_label}</dd>
      </div>
      <div>
        <dt>Tracking number</dt>
        <dd>{shipment.tracking_number || "Not yet recorded"}</dd>
      </div>
      {url && (
        <div>
          <dt>Tracking link</dt>
          <dd>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Track your shipment with {shipment.provider_label} (opens in a new
              tab)
            </a>
          </dd>
        </div>
      )}
      {shipment.shipped_at && (
        <div>
          <dt>Dispatched</dt>
          <dd>{time(shipment.shipped_at)} WAT</dd>
        </div>
      )}
      {shipment.delivered_at && (
        <div>
          <dt>Delivery confirmed by staff</dt>
          <dd>{time(shipment.delivered_at)} WAT</dd>
        </div>
      )}
    </dl>
  );
}
const milestones: Record<string, string> = {
  PENDING_PAYMENT: "Order received",
  PAID: "Payment confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  PAYMENT_REVIEW: "Payment review",
};
export function FulfilmentPanel({
  order,
  admin = false,
  changed,
}: {
  order: OrderRecord;
  admin?: boolean;
  changed: (order: OrderRecord) => void;
}) {
  const operational = admin ? order.fulfilment : undefined;
  const shipment = operational?.shipment ?? order.shipment;
  const [fields, setFields] = useState({
    provider_label: shipment?.provider_label ?? "",
    tracking_number: shipment?.tracking_number ?? "",
    tracking_url: shipment?.tracking_url ?? "",
    operational_notes: operational?.shipment?.operational_notes ?? "",
  });
  const [fieldVersion, setFieldVersion] = useState(order.version);
  if (fieldVersion !== order.version) {
    setFieldVersion(order.version);
    setFields({
      provider_label: shipment?.provider_label ?? "",
      tracking_number: shipment?.tracking_number ?? "",
      tracking_url: shipment?.tracking_url ?? "",
      operational_notes: operational?.shipment?.operational_notes ?? "",
    });
  }
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const lock = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const actions = operational?.actions;
  const unsaved =
    actions?.ship &&
    (fields.provider_label !== (shipment?.provider_label ?? "") ||
      fields.tracking_number !== (shipment?.tracking_number ?? "") ||
      fields.tracking_url !== (shipment?.tracking_url ?? "") ||
      fields.operational_notes !==
        (operational?.shipment?.operational_notes ?? ""));
  async function submit(action: "processing" | "save" | "ship" | "deliver") {
    if (lock.current || (action === "ship" && unsaved)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await orderRequest<OrderRecord>(
        `/admin/orders/${order.id}/${action === "save" ? "shipment" : action}`,
        action === "save" && operational?.shipment ? "PATCH" : "POST",
        {
          expected_version: order.version,
          ...(action === "save"
            ? Object.fromEntries(
                Object.entries(fields).map(([k, v]) => [k, v.trim() || null]),
              )
            : { note: note.trim() || null }),
        },
      );
      if (!mounted.current) return;
      changed(result);
      setNote("");
      setMessage(
        action === "save"
          ? "Shipment details saved."
          : action === "processing"
            ? "Order processing started."
            : action === "ship"
              ? "Order dispatched."
              : "Delivery recorded.",
      );
    } catch (e) {
      if (!mounted.current) return;
      setError(
        e instanceof CheckoutError
          ? [e.message, ...Object.values(e.fields).flat()].join(" ")
          : e instanceof Error
            ? e.message
            : "Unable to update fulfilment. Refresh the order before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      queueMicrotask(() => feedback.current?.focus());
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    void submit("save");
  }
  return (
    <section className="fulfilment-panel" aria-labelledby="fulfilment-heading">
      <h2 id="fulfilment-heading">
        {admin ? "Fulfilment" : "Delivery progress"}
      </h2>
      <ol
        className="fulfilment-timeline"
        aria-label="Recorded order milestones"
      >
        {order.history?.map((item, i) => (
          <li key={i}>
            <strong>{milestones[item.status] ?? item.status}</strong>
            <span>{time(item.at)} WAT</span>
          </li>
        ))}
      </ol>
      <Tracking shipment={shipment} />
      {operational && (
        <>
          <p>
            {operational.payment_verified
              ? "Verified payment and inventory consumption recorded."
              : "Awaiting verified payment and inventory consumption."}
          </p>
          {operational.blocked && (
            <p>
              Preparation and dispatch are unavailable while payment or
              financial review is outstanding.
            </p>
          )}
          <div
            ref={feedback}
            tabIndex={-1}
            role={error ? "alert" : "status"}
            id="fulfilment-feedback"
          >
            {error || message}
          </div>
          {actions?.save && (
            <form
              method="post"
              onSubmit={save}
              className="fulfilment-form"
              aria-label="Shipment details"
              aria-describedby={error ? "fulfilment-feedback" : undefined}
            >
              <p>
                Enter the carrier’s details. A tracking number and approved
                HTTPS link are required before dispatch.
              </p>
              {(
                [
                  ["provider_label", "Carrier name", 160],
                  ["tracking_number", "Tracking number", 160],
                  ["tracking_url", "HTTPS tracking URL", 2048],
                ] as const
              ).map(([key, label, max]) => (
                <label key={key}>
                  {label}
                  <input
                    className="input"
                    name={key}
                    type={key === "tracking_url" ? "url" : "text"}
                    required={key === "provider_label"}
                    maxLength={max}
                    value={fields[key]}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                    aria-describedby={error ? "fulfilment-feedback" : undefined}
                    disabled={busy}
                  />
                </label>
              ))}
              <label>
                Internal packing notes
                <textarea
                  className="input textarea"
                  maxLength={1000}
                  value={fields.operational_notes}
                  onChange={(e) =>
                    setFields({ ...fields, operational_notes: e.target.value })
                  }
                  disabled={busy}
                />
              </label>
              <Button disabled={busy}>
                {busy
                  ? "Saving…"
                  : operational.shipment
                    ? "Save shipment details"
                    : "Create shipment"}
              </Button>
            </form>
          )}
          {(actions?.processing || actions?.ship || actions?.deliver) && (
            <form
              method="post"
              className="fulfilment-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(
                  actions.deliver
                    ? "deliver"
                    : actions.ship
                      ? "ship"
                      : "processing",
                );
              }}
              aria-label="Fulfilment action"
            >
              <label>
                {actions.deliver
                  ? "Delivery confirmation evidence"
                  : "Operational note (optional)"}
                <textarea
                  className="input textarea"
                  required={actions.deliver}
                  maxLength={actions.processing ? 500 : 1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-describedby={error ? "fulfilment-feedback" : undefined}
                  disabled={busy}
                />
              </label>
              {actions.deliver && (
                <p>
                  Record how delivery was confirmed, such as the carrier
                  confirmation reference. This note stays internal.
                </p>
              )}
              {unsaved && <p>Save your shipment changes before dispatching.</p>}
              <Button disabled={busy || !!unsaved}>
                {busy
                  ? "Updating…"
                  : actions.deliver
                    ? "Confirm delivered"
                    : actions.ship
                      ? "Mark dispatched"
                      : "Begin processing"}
              </Button>
            </form>
          )}
          {!actions?.save && operational.shipment?.operational_notes && (
            <p>
              Internal packing notes: {operational.shipment.operational_notes}
            </p>
          )}
          {operational.shipment?.delivery_evidence && (
            <p>Delivery evidence: {operational.shipment.delivery_evidence}</p>
          )}
        </>
      )}
    </section>
  );
}
