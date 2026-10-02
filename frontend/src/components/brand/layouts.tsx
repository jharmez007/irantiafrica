import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
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
export { AdminShell } from "@/components/admin/admin-page";
