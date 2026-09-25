import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { StorefrontChrome } from "@/components/brand/storefront-chrome";
import { CartProvider } from "@/components/cart/cart-provider";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: {
    default: "IRANTI Africa — Memories of Nigeria",
    template: "%s | IRANTI Africa",
  },
  description: "IRANTI Africa. Memories of Nigeria.",
  icons: {
    icon: "/assets/brand/favicon-original.png",
    apple: "/assets/brand/favicon-original.png",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CartProvider>
            <StorefrontChrome>{children}</StorefrontChrome>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
