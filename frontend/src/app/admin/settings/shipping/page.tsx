import { ShippingSettings } from "@/components/admin/commerce-settings";
export const metadata = {
  title: "Shipping settings",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ShippingSettings />;
}
