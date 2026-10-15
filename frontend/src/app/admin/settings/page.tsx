import { CommerceSettingsHome } from "@/components/admin/commerce-settings";
export const metadata = {
  title: "Commerce settings",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <CommerceSettingsHome />;
}
