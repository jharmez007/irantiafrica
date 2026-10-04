import { PageSkeleton } from "@/components/loading";
export default function Loading() {
  return (
    <main id="main-content">
      <PageSkeleton kind="cart" label="Loading your cart" />
    </main>
  );
}
