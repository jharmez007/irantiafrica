import { AdminCatalog } from "@/components/catalog/admin-catalog";
import { AdminShell } from "@/components/brand/layouts";
export const metadata = {
  title: "Catalog administration",
  robots: { index: false, follow: false },
};
export default function AdminCatalogPage() {
  return (
    <AdminShell title="Catalog administration">
      <AdminCatalog />
    </AdminShell>
  );
}
