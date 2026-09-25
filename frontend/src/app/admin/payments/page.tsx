import { AdminPayments } from "@/components/payments/admin-payments";
export const metadata = {
  title: "Payments | IRANTI Africa",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminPayments />;
}
