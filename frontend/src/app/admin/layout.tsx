import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin/admin-frame";
export default function Layout({ children }: { children: ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
