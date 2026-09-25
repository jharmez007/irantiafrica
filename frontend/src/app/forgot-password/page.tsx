import { AuthForm } from "@/components/auth-form";
export const metadata = {
  title: "Recover password",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AuthForm mode="forgot" />;
}
