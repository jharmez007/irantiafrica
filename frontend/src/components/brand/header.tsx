"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { Logo } from "./logo";
import { Container, Drawer, IconButton } from "@/components/ui";
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}
function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M5 8h14l1 13H4L5 8Z" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
const links = [
  { href: "/products", label: "Shop" },
  { href: "/#collections", label: "Collections" },
  { href: "/#our-story", label: "Our story" },
];
export function Header() {
  const [open, setOpen] = useState(false);
  const { cart, loading, error } = useCart();
  const pathname = usePathname();
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="brand-line">
        IRANTI AFRICA <span aria-hidden="true"> · </span> MEMORIES OF NIGERIA
      </div>
      <header className="site-header">
        <Container className="header-inner">
          <IconButton
            label="Open navigation"
            className="mobile-menu-toggle"
            onClick={() => setOpen(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          </IconButton>
          <Logo />
          <nav className="desktop-navigation" aria-label="Main navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <nav className="header-actions" aria-label="Shopping and account">
            <Link
              className="icon-button"
              href="/search"
              aria-label="Search the collection"
            >
              <SearchIcon />
            </Link>
            <Link
              className="icon-button"
              href="/account"
              aria-label="Your account"
            >
              <AccountIcon />
            </Link>
            <Link
              className="icon-button cart-link"
              href="/cart"
              aria-label={
                loading || error || !cart
                  ? "View cart"
                  : `View cart, ${cart.item_count} ${cart.item_count === 1 ? "item" : "items"}`
              }
            >
              <BagIcon />
              {!loading && !error && cart && (
                <span className="cart-count" aria-hidden="true">
                  {cart.item_count > 99 ? "99+" : cart.item_count}
                </span>
              )}
            </Link>
          </nav>
        </Container>
      </header>
      <Drawer open={open} onClose={() => setOpen(false)} title="Explore IRANTI">
        <nav className="mobile-navigation" aria-label="Mobile navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
          <Link href="/cart" onClick={() => setOpen(false)}>
            Your cart<span aria-hidden="true">↗</span>
          </Link>
          <Link href="/account" onClick={() => setOpen(false)}>
            Your account<span aria-hidden="true">↗</span>
          </Link>
        </nav>
        <p className="drawer-note">Memories of Nigeria.</p>
      </Drawer>
    </>
  );
}
