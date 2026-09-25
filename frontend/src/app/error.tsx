"use client";
import { Button, Container } from "@/components/ui";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="not-found">
      <Container>
        <p className="eyebrow">IRANTI Africa</p>
        <h1>The page could not be loaded.</h1>
        <p>Please try again in a moment.</p>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </Container>
    </main>
  );
}
