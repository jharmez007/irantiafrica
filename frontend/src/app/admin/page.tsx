import { AdminDashboard } from "@/components/reporting/admin-dashboard";
export const metadata = {
  title: "Operational dashboard",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminDashboard />;
}
