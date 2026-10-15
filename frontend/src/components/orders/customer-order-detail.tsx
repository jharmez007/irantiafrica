"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ProductImage } from "@/components/catalog/product-image";
import { FulfilmentPanel } from "./fulfilment-panel";
import { PaymentPanel } from "@/components/payments/payment-panel";
import { ReturnsPanel } from "@/components/returns/returns-panel";
import { Button, Modal, Price } from "@/components/ui";
import { orderRequest, type OrderRecord } from "@/lib/order-api";
import { toast } from "@/lib/toast";

const label = (value: string) => value.replaceAll("_", " ").toLowerCase();
const paymentLabel = (state: string) =>
  ({
    NOT_STARTED: "Not started",
    PENDING: "Awaiting confirmation",
    SUCCESSFUL: "Successful",
    FAILED: "Unsuccessful",
    ABANDONED: "Unsuccessful",
    REQUIRES_REVIEW: "Needs review",
  })[state] ?? "Unable to confirm";
const date = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));

export function CustomerOrderDetail({
  order,
  scope,
  guest,
  paymentReturn,
  reload,
  changed,
}: {
  order: OrderRecord;
  scope: string;
  guest: boolean;
  paymentReturn: boolean;
  reload: () => void;
  changed: (order: OrderRecord) => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const cancelLock = useRef(false);
  const statusFocus = useRef<HTMLParagraphElement>(null);
  const delivery = order.calculation?.delivery;
  const address = order.contact?.address;

  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!order.can_cancel || cancelLock.current) return;
    cancelLock.current = true;
    setCancelling(true);
    setCancelError("");
    try {
      const next = await orderRequest<OrderRecord>(
        `/orders/${order.id}/cancel`,
        "POST",
        {
          expected_version: order.version,
          reason: "Customer cancelled before payment",
        },
      );
      changed(next);
      setCancelOpen(false);
      toast.success("Order cancelled");
      setTimeout(() => statusFocus.current?.focus(), 0);
    } catch (failure) {
      setCancelError(
        failure instanceof Error
          ? failure.message
          : "Unable to cancel this order. Please try again.",
      );
    } finally {
      cancelLock.current = false;
      setCancelling(false);
    }
  }

  return (
    <article className="order-detail customer-order-detail">
      <header className="customer-order-header">
        <Link href={guest ? "/products" : "/account/orders"}>
          {guest ? "← Continue shopping" : "← Back to orders"}
        </Link>
        <h1>Order details</h1>
        <div className="customer-order-header-main">
          <div>
            <p className="eyebrow">Order reference</p>
            <p className="order-reference">{order.number}</p>
            <p>Placed {date(order.created_at)} WAT</p>
          </div>
          <div className="customer-order-statuses">
            <p>
              <span>Order status</span>
              <strong>{label(order.status)}</strong>
            </p>
            <p>
              <span>Payment status</span>
              <strong>{paymentLabel(order.payment.state)}</strong>
            </p>
          </div>
        </div>
        {order.status === "CANCELLED" && (
          <p
            className="customer-order-message"
            role="status"
            tabIndex={-1}
            ref={statusFocus}
          >
            This order is cancelled.
          </p>
        )}
      </header>
      <div className="customer-order-grid">
        <FulfilmentPanel key={scope} order={order} changed={changed} />
        <section
          className="customer-order-items order-card"
          aria-labelledby="order-items-heading"
        >
          <h2 id="order-items-heading">Your items</h2>
          <ul className="customer-order-item-list">
            {order.lines?.map((line) => (
              <li className="customer-order-item" key={line.id}>
                <div className="order-line-image">
                  <ProductImage
                    image={line.snapshot.image ?? undefined}
                    sizes="72px"
                  />
                </div>
                <div className="customer-order-item-copy">
                  <h3>{line.snapshot.name}</h3>
                  {line.snapshot.options.length > 0 && (
                    <p>{line.snapshot.options.join(" · ")}</p>
                  )}
                  <p>
                    Qty {line.quantity} ×{" "}
                    <Price value={line.unit_price_minor} />
                  </p>
                  <details>
                    <summary>Price breakdown</summary>
                    <dl>
                      <div>
                        <dt>Items before tax</dt>
                        <dd>
                          <Price value={line.line_subtotal_minor} />
                        </dd>
                      </div>
                      <div>
                        <dt>Item tax</dt>
                        <dd>
                          <Price value={line.tax_minor} />
                        </dd>
                      </div>
                    </dl>
                  </details>
                </div>
                <p className="customer-order-item-total">
                  <span>Line total (incl. tax)</span>
                  <strong>
                    <Price value={line.line_total_minor} />
                  </strong>
                </p>
              </li>
            ))}
          </ul>
        </section>
        <aside
          className="customer-order-sidebar"
          aria-label="Order total and actions"
        >
          <div className="customer-order-sidebar-panel">
            <section
              className="order-summary"
              aria-labelledby="order-total-heading"
            >
              <h2 id="order-total-heading">Order total</h2>
              <dl>
                <div>
                  <dt>Items subtotal</dt>
                  <dd>
                    <Price value={order.subtotal_minor} />
                  </dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>
                    <Price value={order.delivery_minor} />
                  </dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>
                    <Price value={order.tax_minor} />
                  </dd>
                </div>
                <div className="customer-order-grand-total">
                  <dt>Total</dt>
                  <dd>
                    <Price value={order.total_minor} />
                  </dd>
                </div>
              </dl>
              <details className="customer-order-tax-breakdown">
                <summary>Tax breakdown</summary>
                <dl>
                  <div>
                    <dt>Product tax</dt>
                    <dd>
                      <Price value={order.product_tax_minor} />
                    </dd>
                  </div>
                  <div>
                    <dt>Delivery tax</dt>
                    <dd>
                      <Price value={order.delivery_tax_minor} />
                    </dd>
                  </div>
                </dl>
              </details>
            </section>
            <PaymentPanel
              key={scope}
              order={order}
              returning={paymentReturn}
              changed={reload}
              compact
            />
            {order.can_cancel && (
              <section
                className="customer-order-actions"
                aria-labelledby="order-actions-heading"
              >
                <h2 id="order-actions-heading">Order actions</h2>
                <p>You can cancel this order before payment starts.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCancelError("");
                    setCancelOpen(true);
                  }}
                >
                  Cancel order
                </Button>
              </section>
            )}
          </div>
        </aside>
        {order.contact && (
          <section
            className="customer-order-delivery order-card"
            aria-labelledby="order-delivery-heading"
          >
            <h2 id="order-delivery-heading">Delivery details</h2>
            <address className="order-address">
              {address?.recipient_name}
              <br />
              {address?.line1}
              <br />
              {address?.line2 && (
                <>
                  {address.line2}
                  <br />
                </>
              )}
              {address?.city}, {address?.state_code}
              <br />
              {address?.postal_code && (
                <>
                  {address.postal_code}
                  <br />
                </>
              )}
              {address?.country_code === "NG"
                ? "Nigeria"
                : address?.country_code}
            </address>
            <dl className="customer-order-contact">
              <div>
                <dt>Phone</dt>
                <dd>{address?.phone}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{order.contact.email}</dd>
              </div>
              {delivery?.service_label && (
                <div>
                  <dt>Delivery method</dt>
                  <dd>{delivery.service_label}</dd>
                </div>
              )}
              {delivery?.estimate && (
                <div>
                  <dt>Estimated delivery</dt>
                  <dd>{delivery.estimate}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
        <ReturnsPanel key={scope + ":returns"} order={order} />
        <section
          className="customer-order-activity order-card"
          aria-labelledby="order-history-heading"
        >
          <h2 id="order-history-heading">Order activity</h2>
          {order.history?.length ? (
            <ol className="customer-order-activity-list">
              {order.history.map((event, index) => (
                <li key={`${event.at}:${index}`}>
                  <strong>{label(event.status)}</strong>
                  <time dateTime={event.at}>{date(event.at)} WAT</time>
                </li>
              ))}
            </ol>
          ) : (
            <p>No order activity recorded yet.</p>
          )}
        </section>
      </div>
      <Modal
        open={cancelOpen && order.can_cancel}
        onClose={() => {
          if (!cancelling) setCancelOpen(false);
        }}
        title="Cancel this order?"
        descriptionId="customer-order-cancel-description"
      >
        <form onSubmit={(event) => void cancel(event)}>
          <p id="customer-order-cancel-description">
            This unpaid order will be cancelled and remain in your order
            history.
          </p>
          {cancelError && <p role="alert">{cancelError}</p>}
          <div className="customer-order-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={cancelling}
              onClick={() => setCancelOpen(false)}
            >
              Keep order
            </Button>
            <Button type="submit" disabled={cancelling} loading={cancelling}>
              Cancel order
            </Button>
          </div>
        </form>
      </Modal>
    </article>
  );
}
