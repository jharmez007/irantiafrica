import { AccountBoundary } from "@/components/account-boundary";
export const metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AccountBoundary />;
}
