import Link from "next/link";
import { Container } from "@/components/ui";
import { Logo } from "./logo";
export function Footer() {
  return (
    <footer className="site-footer">
      <Container>
        <div className="footer-grid">
          <div className="footer-identity">
            <Logo variant="vertical" />
            <p>Memories of Nigeria.</p>
          </div>
          <nav aria-label="Explore">
            <h2>Explore</h2>
            <Link href="/products">The collection</Link>
            <Link href="/#collections">Categories</Link>
            <Link href="/#our-story">Our story</Link>
            <Link href="/account">Your account</Link>
          </nav>
          <div className="footer-policies">
            <h2>Here to help</h2>
            <span>Contact</span>
            <span>Shipping &amp; delivery</span>
            <span>Returns &amp; exchanges</span>
            <p>Details will be shared here.</p>
          </div>
          <div className="footer-policies">
            <h2>The details</h2>
            <span>Privacy policy</span>
            <span>Terms &amp; conditions</span>
            <p>Policies will be published here.</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} IRANTI Africa</p>
          <p>Memories to keep.</p>
        </div>
      </Container>
    </footer>
  );
}
