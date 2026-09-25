export { orderRequest as returnRequest } from "./order-api";
export type ReturnItem = {
  id: string;
  order_item_id: string;
  name: string;
  quantity: number;
  approved_quantity: number;
  received_quantity: number;
  restocked_quantity: number;
  disposition: string | null;
};
export type ReturnRecord = {
  id: string;
  order_id: string;
  requester: string;
  status: string;
  version: number;
  reason_code: string;
  explanation: string | null;
  submitted_at: string;
  cutoff_at: string;
  decision_reason: string | null;
  items: ReturnItem[];
  history: {
    event: string;
    status?: string;
    at?: string;
    to_status?: string;
    created_at?: string;
    note?: string;
  }[];
  refund: {
    id: string;
    status: string;
    amount_minor: string;
    currency: string;
  } | null;
  payment_summary?: {
    state: string;
    financial_hold: boolean;
    captured_minor: string;
    refunded_minor: string;
    reserved_minor: string;
    net_minor: string;
  };
  actions?: Record<string, boolean>;
  refund_actions?: Record<string, boolean>;
};
export type ReturnList = {
  eligibility: { eligible: boolean; reason: string; cutoff: string | null };
  reasons: string[];
  items: { order_item_id: string; available_quantity: number }[];
  returns: ReturnRecord[];
};
export const reasonLabels: Record<string, string> = {
  DAMAGED_PRODUCT: "Damaged product",
  WRONG_PRODUCT_DELIVERED: "Wrong product delivered",
  DEFECTIVE_PRODUCT: "Defective product",
};
export const returnLabel = (value: string) =>
  value.replaceAll("_", " ").toLowerCase();
