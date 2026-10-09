import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { StorefrontChrome } from "@/components/brand/storefront-chrome";
import { CartProvider } from "@/components/cart/cart-provider";
import { AuthProvider } from "@/components/auth-provider";
import { ToastProvider } from "@/components/toast-provider";
import { previewNoindex } from "@/lib/preview";

export const metadata: Metadata = {
  title: {
    default: "IRANTI Africa — Memories of Nigeria",
    template: "%s | IRANTI Africa",
  },
  description: "IRANTI Africa. Memories of Nigeria.",
  robots: { index: !previewNoindex(), follow: !previewNoindex() },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthProvider>
            <CartProvider>
              <StorefrontChrome>{children}</StorefrontChrome>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
