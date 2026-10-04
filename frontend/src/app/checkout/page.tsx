import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout/checkout-page";
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <CheckoutPage />;
}
