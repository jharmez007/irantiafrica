import { orderRequest } from "@/lib/order-api";
import type {
  Attempt,
  PaymentSummary,
} from "@/components/payments/payment-panel";
import { navigateToPaystack } from "@/lib/payment-destination";

const inPageKeys = new Map<string, string>();
const isActive = (status: string) =>
  ["INITIALIZING", "PENDING", "UNKNOWN"].includes(status);

/** Reconcile the owned order before resuming or creating a payable attempt. */
export async function continueHostedPayment(
  orderId: string,
  onRedirecting?: () => void,
): Promise<"successful" | "redirecting"> {
  const root = `/orders/${orderId}`;
  let summary = await orderRequest<PaymentSummary>(`${root}/payment-status`);
  if (summary.order.payment.state === "SUCCESSFUL") return "successful";

  let active = summary.attempts.find((attempt) => isActive(attempt.status));
  if (active) {
    summary = await orderRequest<PaymentSummary>(
      `${root}/payment-attempts/${active.id}/verify`,
      "POST",
      {},
    );
    if (summary.order.payment.state === "SUCCESSFUL") return "successful";
    active = summary.attempts.find((attempt) => isActive(attempt.status));
    if (active) {
      if (active.status !== "PENDING")
        throw new Error(
          "The previous payment is still being checked. Check its status before trying again.",
        );
      const resumed = await orderRequest<Attempt>(
        `${root}/payment-attempts/${active.id}/resume`,
      );
      if (!resumed.authorization_url)
        throw new Error(
          "The previous payment cannot be resumed. Check its status before trying again.",
        );
      onRedirecting?.();
      navigateToPaystack(resumed.authorization_url);
      return "redirecting";
    }
  }
  if (!summary.order.payment.available)
    throw new Error(
      "This order is not ready for payment. Review its reservation and payment status before retrying.",
    );

  const storageKey = `iranti-payment-start-${orderId}`;
  let key = inPageKeys.get(orderId);
  if (summary.attempts.length > 0) {
    // A verified terminal attempt requires a new key; a lost response to the
    // new POST is recovered above as an active attempt on the next click.
    key = crypto.randomUUID();
  } else {
    try {
      key ??= sessionStorage.getItem(storageKey) ?? undefined;
    } catch {
      /* In-page retry still has a stable key. */
    }
    key ??= crypto.randomUUID();
  }
  inPageKeys.set(orderId, key);
  try {
    sessionStorage.setItem(storageKey, key);
  } catch {
    /* Backend idempotency and active-attempt constraints remain authoritative. */
  }
  const attempt = await orderRequest<Attempt>(
    `${root}/payment-attempts`,
    "POST",
    { method: "hosted" },
    key,
  );
  if (attempt.status === "FAILED")
    throw new Error(
      "Paystack did not start this payment. You can retry while the order's stock reservation remains active.",
    );
  if (!attempt.authorization_url)
    throw new Error(
      "Paystack has not confirmed payment setup. Check again before retrying; no new payment was started.",
    );
  onRedirecting?.();
  navigateToPaystack(attempt.authorization_url);
  return "redirecting";
}
