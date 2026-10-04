import { PageSkeleton } from "@/components/loading";
export default function Loading() {
  return (
    <main id="main-content">
      <PageSkeleton kind="checkout" label="Loading checkout" />
    </main>
  );
}
