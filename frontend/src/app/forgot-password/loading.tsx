import { PageSkeleton } from "@/components/loading";
export default function Loading() {
  return (
    <main id="main-content">
      <PageSkeleton kind="auth" label="Preparing account recovery" />
    </main>
  );
}
