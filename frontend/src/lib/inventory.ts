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
  recorded_by: string;
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
export function inventoryPermissions(permissions: string[] = []) {
  return {
    read: permissions.includes("inventory.read"),
    quantities: permissions.includes("inventory.movements.read"),
    manage: permissions.includes("inventory.adjust"),
  };
}
