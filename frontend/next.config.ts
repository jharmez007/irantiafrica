import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
const parsedOrigin = new URL(apiOrigin);
if (!["http:", "https:"].includes(parsedOrigin.protocol)) {
  throw new Error("API_INTERNAL_URL must be an HTTP(S) origin.");
}
if (
  parsedOrigin.username ||
  parsedOrigin.password ||
  parsedOrigin.pathname !== "/" ||
  parsedOrigin.search ||
  parsedOrigin.hash
) {
  throw new Error(
    "API_INTERNAL_URL must be an origin without credentials or a path.",
  );
}

// Exact HTTPS origins for the owned derivative CDN and signed upload endpoint.
const assetOrigins = (process.env.CSP_ASSET_ORIGINS ?? "")
  .split(",")
  .filter(Boolean)
  .map((value) => {
    const origin = new URL(value.trim());
    if (
      origin.protocol !== "https:" ||
      origin.hostname.includes("*") ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      throw new Error("CSP_ASSET_ORIGINS requires exact HTTPS origins.");
    }
    return origin.origin;
  })
  .join(" ");
const production = process.env.NODE_ENV === "production";
const httpsSite =
  new URL(process.env.SITE_URL ?? "http://localhost:3000").protocol ===
  "https:";
// Static Next hydration uses inline scripts; a nonce would require dynamic rendering.
// Keep that explicit exception; never permit eval in a production build.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${assetOrigins}`,
  "font-src 'self'",
  `connect-src 'self' ${assetOrigins}`,
  `form-action 'self' ${assetOrigins}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/sanctum/csrf-cookie",
        destination: `${parsedOrigin.origin}/sanctum/csrf-cookie`,
      },
      {
        source: "/api/:path*",
        destination: `${parsedOrigin.origin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          ...(production
            ? [{ key: "Content-Security-Policy", value: csp }]
            : []),
          ...(production && httpsSite
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};
export default config;
