import type { Address } from "./checkout-api";
export { checkoutRequest as orderRequest } from "./checkout-api";
export type OrderRecord = {
  id: string;
  number: string;
  ownership: "account" | "guest";
  status:
    | "PENDING_PAYMENT"
    | "CANCELLED"
    | "PAID"
    | "PAYMENT_REVIEW"
    | "PROCESSING"
    | "SHIPPED"
    | "DELIVERED";
  version: number;
  created_at: string;
  cancelled_at: string | null;
  currency: "NGN";
  subtotal_minor: string;
  product_tax_minor: string;
  delivery_minor: string;
  delivery_tax_minor: string;
  tax_minor: string;
  total_minor: string;
  payment: { state: string; available: boolean };
  reservation: { status: string; expires_at: string; eligible: boolean };
  item_count: number;
  can_cancel: boolean;
  shipment?: Shipment | null;
  fulfilment?: {
    shipment:
      | (Shipment & {
          id: string;
          operational_notes: string | null;
          delivery_evidence: string | null;
        })
      | null;
    payment_verified: boolean;
    blocked: boolean;
    actions: {
      processing: boolean;
      save: boolean;
      ship: boolean;
      deliver: boolean;
    };
  };
  contact?: { email: string; address: Address };
  calculation?: { development_only: boolean };
  lines?: {
    id: string;
    quantity: number;
    unit_price_minor: string;
    line_subtotal_minor: string;
    tax_minor: string;
    line_total_minor: string;
    snapshot: { name: string; sku: string; options: string[] };
  }[];
  history?: { status: string; at: string }[];
};
export type OrderList = { items: OrderRecord[]; next_cursor: string | null };

export type Shipment = {
  status: "PREPARED" | "SHIPPED" | "DELIVERED";
  provider_label: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
};
