import { csrfCookie } from "./auth-api";
import { reportSessionFailure } from "./session-events";
import type { CatalogImage } from "./catalog";
export type CartLine = {
  id: string;
  variant_id: string;
  name: string;
  slug: string | null;
  options: string[];
  image: CatalogImage | null;
  quantity: number;
  available_quantity: number;
  low_stock?: boolean;
  unit_price_minor: string | null;
  line_subtotal_minor: string | null;
  suggested_quantity: number;
  held_by_order_quantity?: number;
  state:
    | "AVAILABLE"
    | "QUANTITY_REVIEW"
    | "OUT_OF_STOCK"
    | "UNAVAILABLE"
    | "AMOUNT_REVIEW";
};
export type CartData = {
  version: number;
  currency: "NGN";
  items: CartLine[];
  item_count: number;
  subtotal_minor: string | null;
  needs_review: boolean;
  amount_limit: boolean;
  limits: { quantity: number; lines: number };
  merge: { status: string; message: string } | null;
  linked_order?: {
    id: string;
    number: string;
    ownership: "account" | "guest";
    status: string;
    payment_state: string;
    total_minor: string;
    currency: "NGN";
    version: number;
    cart_changed: boolean;
    reservation_status: string;
    reservation_expires_at: string;
    reservation_active: boolean;
    attempt_status: string | null;
    release_confirmed: boolean;
    payment_unresolved: boolean;
    can_continue: boolean;
    can_cancel: boolean;
    can_start_new: boolean;
  } | null;
};
export class CartApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function cartRequest(
  method = "GET",
  suffix = "",
  payload?: Record<string, string | number>,
): Promise<CartData> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (method !== "GET") {
    const bootstrap = await fetch("/sanctum/csrf-cookie", {
      credentials: "include",
      cache: "no-store",
    });
    if (!bootstrap.ok)
      throw new CartApiError(
        bootstrap.status,
        "SESSION_UNAVAILABLE",
        "Unable to start a secure cart session. Please retry.",
      );
    headers["X-XSRF-TOKEN"] = csrfCookie(document.cookie);
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/v1/cart${suffix}`, {
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    reportSessionFailure(response.status, `/cart${suffix}`);
    const fields = body.error?.fields as Record<string, string[]> | undefined;
    throw new CartApiError(
      response.status,
      body.error?.code ?? "CART_ERROR",
      (fields && Object.values(fields).flat().join(" ")) ||
        body.error?.message ||
        "Unable to update your cart. Please retry.",
    );
  }
  return body.data as CartData;
}
