import type { Dashboard } from "../../src/components/reporting/admin-dashboard";
export const ownerPermissions = [
  "reports.sales",
  "reports.orders",
  "reports.stock",
  "reports.products",
  "orders.read",
  "returns.read",
  "payments.reconcile",
  "audit.read",
];
export const reportingFixture: Dashboard = {
  range: { from: "2026-08-26", to: "2026-09-24", timezone: "Africa/Lagos" },
  as_of: "2026-09-24T12:00:00Z",
  sales: {
    values: { paid_orders: 12 },
    formatted: {
      gross_minor: "NGN 9,999,999,999,999.99",
      refunded_minor: "NGN 369.00",
      net_minor: "NGN 9,999,999,999,630.99",
      items_minor: "NGN 8,000.00",
      delivery_minor: "NGN 500.00",
      tax_minor: "NGN 150.00",
      held_minor: "NGN 0.00",
    },
    unapplied_receipts: 1,
    daily: [
      { day: "2026-09-24", paid_orders: 12, gross: "NGN 9,999,999,999,999.99" },
    ],
    definition:
      "Applied receipts including delivery/tax; completed refunds deducted on completion dates. Operational collections, not accounting profit.",
  },
  orders: {
    scope: "Orders created in range, current state",
    counts: {
      PENDING_PAYMENT: 1,
      PAID: 2,
      PROCESSING: 3,
      SHIPPED: 4,
      DELIVERED: 5,
      CANCELLED: 1,
      PAYMENT_REVIEW: 1,
    },
    current_backlog: [{ status: "PROCESSING", count: 3 }],
    items: [
      {
        public_reference: "IRA-LONG-REFERENCE-1234567890",
        status: "DELIVERED",
        payment_state: "SUCCESSFUL",
        created_at: "2026-09-24T11:00:00Z",
      },
    ],
    pagination: { page: 1, last_page: 2, total: 26 },
  },
  stock: {
    scope: "Current active variants",
    counts: { low_stock: 2, out_of_stock: 1, uninitialized: 1 },
    items: [
      {
        sku: "IRANTI-HANDWOVEN-LARGE-ORANGE",
        product_name:
          "Handwoven heritage basket with a long historical product name and natural fibres",
        on_hand: 5,
        reserved: 4,
        available_quantity: 1,
        low_stock_threshold: 3,
      },
      {
        sku: "UNINITIALIZED",
        product_name: "Awaiting stock setup",
        on_hand: null,
        reserved: null,
        available_quantity: null,
        low_stock_threshold: null,
      },
    ],
    recent_adjustments: [
      {
        variant_id: "00000000-0000-4000-8000-000000000001",
        kind: "ADJUSTMENT",
        on_hand_delta: 4,
        created_at: "2026-09-24T11:00:00Z",
      },
    ],
    pagination: { page: 1, last_page: 1, total: 2 },
  },
  products: {
    scope:
      "Historical item value excludes tax and delivery; refunds separately by completion date",
    items: [
      {
        name: "Historical handwoven basket with a long descriptive name",
        sku: "BASKET-ORANGE-LARGE",
        units: "12",
        gross: "NGN 9,999,999,999,999.99",
        refunded_units: "1",
        refunded_base: "NGN 335.00",
        refunded_tax: "NGN 34.00",
      },
    ],
    pagination: { page: 1, last_page: 1, total: 1 },
  },
  payments: {
    scope: "Attempt creation date; current state",
    counts: [{ status: "REQUIRES_REVIEW", count: 1 }],
    issues: [
      {
        order_id: "00000000-0000-4000-8000-000000000001",
        status: "REQUIRES_REVIEW",
        created_at: "2026-09-24T11:00:00Z",
      },
    ],
    reconciliation_needed: 1,
  },
  returns: {
    scope: "Submitted in range; current open queue uses all dates",
    counts: [{ status: "APPROVED", count: 1 }],
    open_count: 1,
    queue: [
      {
        order_id: "00000000-0000-4000-8000-000000000001",
        status: "APPROVED",
        submitted_at: "2026-09-24T11:00:00Z",
      },
    ],
    refund_counts: [{ status: "UNKNOWN", count: 1 }],
    refund_queue: [
      {
        order_id: "00000000-0000-4000-8000-000000000001",
        status: "UNKNOWN",
        created_at: "2026-09-24T11:00:00Z",
      },
    ],
  },
  notifications: {
    scope: "Current email health",
    enabled: false,
    counts: [
      { status: "UNKNOWN", count: 1 },
      { status: "SIMULATED", count: 10 },
    ],
    pending_retry: 0,
  },
};
