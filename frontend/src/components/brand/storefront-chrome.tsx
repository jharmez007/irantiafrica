"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "./header";
import { Footer } from "./footer";
import { CheckoutChrome } from "./checkout-chrome";
export function StorefrontChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const separate =
    pathname.startsWith("/admin") ||
    ["/login", "/register", "/forgot-password", "/reset-password", "/mfa"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  return separate ? (
    children
  ) : pathname === "/checkout" ? (
    <CheckoutChrome>{children}</CheckoutChrome>
  ) : (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
