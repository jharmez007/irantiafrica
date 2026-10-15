import { TaxSettings } from "@/components/admin/commerce-settings";
export const metadata = {
  title: "Tax settings",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <TaxSettings />;
}
