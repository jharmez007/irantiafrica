import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/catalog-server";
import { previewNoindex } from "@/lib/preview";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  if (previewNoindex()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/account/",
        "/mfa",
        "/reset-password",
        "/search",
        "/api/",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteOrigin).href,
  };
}
