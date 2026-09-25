import { AuthForm } from "@/components/auth-form";
export const metadata = {
  title: "Create account",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AuthForm mode="register" />;
}
