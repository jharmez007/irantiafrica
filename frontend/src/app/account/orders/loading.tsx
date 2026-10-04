import { PageSkeleton } from "@/components/loading";
export default function Loading() {
  return (
    <main id="main-content">
      <PageSkeleton kind="account" label="Loading order history" />
    </main>
  );
}
