import { AdminInventory } from "@/components/inventory/admin-inventory";
import { AdminShell } from "@/components/brand/layouts";
export const metadata = {
  title: "Inventory",
  robots: { index: false, follow: false },
};
export default function InventoryPage() {
  return (
    <AdminShell title="Inventory">
      <AdminInventory />
    </AdminShell>
  );
}
