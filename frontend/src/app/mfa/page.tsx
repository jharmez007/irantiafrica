import { MfaScreen } from "@/components/mfa-screen";
export const metadata = {
  title: "Account security",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <MfaScreen />;
}
