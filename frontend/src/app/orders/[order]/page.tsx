import { OrderPage } from "@/components/orders/order-page";
export const metadata = {
  title: "Order detail | IRANTI Africa",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ order: string }>;
}) {
  const { order } = await params;
  return <OrderPage id={order} guest />;
}
