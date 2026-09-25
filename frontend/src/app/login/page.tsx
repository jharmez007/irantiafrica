import { AuthForm } from "@/components/auth-form";
export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AuthForm mode="login" />;
}
