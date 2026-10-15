import { PaymentResult } from "@/components/payments/payment-result";
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
  return <PaymentResult id={order} />;
}
