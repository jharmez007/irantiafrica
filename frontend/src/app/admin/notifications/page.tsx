import { AdminDashboard } from "@/components/reporting/admin-dashboard";
export const metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminDashboard mode="notifications" />;
}
