import { AdminProductEditor } from "@/components/catalog/product-editor";
import { AdminShell } from "@/components/brand/layouts";
export const metadata = {
  title: "Add Product",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <AdminShell
      title="Add Product"
      width="form"
      parent={{ label: "Products", href: "/admin/products" }}
    >
      <AdminProductEditor />
    </AdminShell>
  );
}
