import { OrderPage } from "@/components/orders/order-page";
export const metadata = {
  title: "Payment confirmation | IRANTI Africa",
  robots: { index: false, follow: false },
  referrer: "same-origin" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ order: string }>;
}) {
  const { order } = await params;
  return <OrderPage id={order} guest paymentReturn />;
}
