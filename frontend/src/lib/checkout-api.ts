import { csrfCookie } from "./auth-api";
export type Address = {
  recipient_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state_code: string;
  locality_code?: string | null;
  postal_code?: string | null;
  country_code: "NG";
};
export type SavedAddress = Address & { id: string };
export type Destinations = {
  states: Record<string, string>;
  areas: { state_code: string; locality_code: string | null }[];
};
export type Checkout = {
  order_id?: string | null;
  id: string;
  ownership: "guest" | "account";
  status:
    | "DRAFT"
    | "QUOTED"
    | "RESERVED"
    | "REVIEW_REQUIRED"
    | "EXPIRED"
    | "CANCELLED";
  version: number;
  currency: "NGN";
  expires_at: string;
  fingerprint: string | null;
  subtotal_minor: string;
  tax_minor: string | null;
  delivery_minor: string | null;
  total_minor: string | null;
  contact: { email: string; address: Address } | null;
  calculation: {
    development_only: boolean;
    product_tax_minor: string;
    delivery_tax_minor: string;
    delivery_taxable: boolean;
    delivery: { service_label: string };
  } | null;
  lines: {
    id: string;
    quantity: number;
    unit_price_minor: string;
    line_subtotal_minor: string;
    snapshot: { name: string; sku: string; options: string[] };
    tax: { tax_minor: string } | null;
  }[];
};
export class CheckoutError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string[]> = {},
    public details: { checkout?: Checkout; checkout_id?: string } = {},
  ) {
    super(message);
  }
}
export async function checkoutRequest<T>(
  path: string,
  method = "GET",
  data?: Record<string, unknown>,
  key?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (method !== "GET") {
    const boot = await fetch("/sanctum/csrf-cookie", {
      credentials: "include",
      cache: "no-store",
    });
    if (!boot.ok)
      throw new CheckoutError(
        boot.status,
        "SESSION_UNAVAILABLE",
        "Unable to establish a secure checkout session. Retry.",
      );
    headers["X-XSRF-TOKEN"] = csrfCookie(document.cookie);
    headers["Content-Type"] = "application/json";
  }
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch("/api/v1" + path, {
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await response.json();
  if (!response.ok)
    throw new CheckoutError(
      response.status,
      body.error?.code ?? "CHECKOUT_ERROR",
      body.error?.message ?? "Checkout could not be updated.",
      body.error?.fields ?? {},
      body.error?.details ?? {},
    );
  return body.data as T;
}
