import { AdminCategories } from "@/components/catalog/admin-categories";
export const metadata = {
  title: "Category",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AdminCategories editId={(await params).id} />;
}
