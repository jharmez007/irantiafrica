import Link from "next/link";
import { Container } from "@/components/ui";
export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <Container>
        <p className="eyebrow">IRANTI Africa · 404</p>
        <h1>A different path home.</h1>
        <p>We couldn’t find the page you’re looking for.</p>
        <Link className="button button--primary" href="/">
          Return home
        </Link>
      </Container>
    </main>
  );
}
