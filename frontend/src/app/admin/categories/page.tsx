import { AdminCategories } from "@/components/catalog/admin-categories";
export const metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminCategories />;
}
