import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { Container } from "@/components/ui";
export function AuthLayout({
  title,
  eyebrow = "Welcome to IRANTI",
  intro,
  children,
}: {
  title: string;
  eyebrow?: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="auth-layout">
      <div className="auth-brand">
        <Link href="/" className="auth-back">
          ← Back to IRANTI Africa
        </Link>
        <Logo variant="vertical" linked={false} />
        <p>Memories of Nigeria.</p>
      </div>
      <section className="auth-content">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-content-inner">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {intro && <p className="auth-intro">{intro}</p>}
          {children}
        </div>
        <Link className="auth-return text-link" href="/products">
          Explore the collection
        </Link>
      </section>
    </main>
  );
}
export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="admin-header">
        <Container>
          <Link href="/admin" className="admin-brand">
            IRANTI <span>Workspace</span>
          </Link>
          <nav aria-label="Administration">
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/catalog">Catalog</Link>
            <Link href="/admin/returns">Returns</Link>
            <Link href="/account">Account</Link>
            <Link href="/">View storefront ↗</Link>
          </nav>
        </Container>
      </header>
      <main id="main-content" className="admin-main">
        <Container>
          <div className="admin-page-heading">
            <p className="eyebrow">IRANTI Africa · Administration</p>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {children}
        </Container>
      </main>
    </div>
  );
}
