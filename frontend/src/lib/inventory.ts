export type InventoryEntry = {
  variant_id: string;
  sku: string;
  product_id: string;
  product_name: string;
  variant_status: string;
  product_status: string;
  available: boolean;
  initialized?: boolean;
  on_hand?: number;
  reserved?: number;
  available_quantity?: number;
  low_stock_threshold?: number;
  low_stock?: boolean;
  version?: string | null;
};
export type InventoryMovement = {
  id: string;
  kind: string;
  on_hand_delta: number;
  reserved_delta: number;
  on_hand_after: number;
  reserved_after: number;
  reason: string;
  created_at: string;
  actor?: { id: string; name: string } | null;
};
export type InventoryPage<T> = {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};
export function inventoryPermissions(roles: string[] = []) {
  return {
    read: roles.some((role) =>
      ["owner", "inventory_store", "order_processing"].includes(role),
    ),
    quantities: roles.some((role) =>
      ["owner", "inventory_store"].includes(role),
    ),
    manage: roles.includes("owner"),
  };
}
