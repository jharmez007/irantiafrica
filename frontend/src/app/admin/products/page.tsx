import { AdminProducts } from "@/components/catalog/admin-products";
export const metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminProducts />;
}
