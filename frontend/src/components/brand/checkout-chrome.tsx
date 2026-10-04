import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui";
import { Logo } from "./logo";

export function CheckoutChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="checkout-site-header">
        <Container className="checkout-header-inner">
          <Logo />
          <div className="checkout-header-actions">
            <span className="checkout-security">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="1" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Protected checkout
            </span>
            <Link href="/cart">Back to cart</Link>
          </div>
        </Container>
      </header>
      {children}
      <footer className="checkout-site-footer">
        <Container>
          <p>© {new Date().getFullYear()} IRANTI Africa</p>
          <p>
            Contact · Shipping &amp; delivery · Returns &amp; exchanges ·
            Privacy policy · Terms &amp; conditions
          </p>
        </Container>
      </footer>
    </>
  );
}
