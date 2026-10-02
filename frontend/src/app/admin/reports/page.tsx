import { AdminDashboard } from "@/components/reporting/admin-dashboard";
export const metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminDashboard mode="reports" />;
}
