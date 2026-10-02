import { AdminStaff } from "@/components/staff/admin-staff";
export const metadata = {
  title: "Staff",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminStaff />;
}
