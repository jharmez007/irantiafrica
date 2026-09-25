import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/catalog-server";
export default function robots(): MetadataRoute.Robots {
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
