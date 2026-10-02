import { AdminProductEditor } from "@/components/catalog/product-editor";
import { AdminShell } from "@/components/brand/layouts";
export const metadata = {
  title: "Edit product",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell
      title="Edit product"
      parent={{ label: "Products", href: "/admin/products" }}
    >
      <AdminProductEditor id={id} />
    </AdminShell>
  );
}
