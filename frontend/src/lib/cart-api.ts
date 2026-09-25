import { csrfCookie } from "./auth-api";
import type { CatalogImage } from "./catalog";
export type CartLine = {
  id: string;
  variant_id: string;
  name: string;
  slug: string | null;
  options: string[];
  image: CatalogImage | null;
  quantity: number;
  unit_price_minor: string | null;
  line_subtotal_minor: string | null;
  suggested_quantity: number;
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
  const body = await response.json();
  if (!response.ok) {
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
