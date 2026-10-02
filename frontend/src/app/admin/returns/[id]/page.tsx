import { AdminReturns } from "@/components/returns/admin-returns";
export const metadata = {
  title: "Return detail",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AdminReturns id={(await params).id} />;
}
