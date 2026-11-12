import type { Metadata } from "next";
import { AdminRecycleBin } from "@/components/catalog/admin-recycle-bin";

export const metadata: Metadata = {
  title: "Recycle Bin",
};

export default function RecycleBinPage() {
  return <AdminRecycleBin />;
}
