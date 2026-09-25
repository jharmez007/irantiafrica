import { ApiError } from "./auth-api";
export async function catalogFetch<T>(path: string): Promise<T> {
  const response = await fetch(
    `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000"}/api/v1${path}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(process.env.CATALOG_INTERNAL_READ_KEY
          ? { "X-Catalog-Renderer": process.env.CATALOG_INTERNAL_READ_KEY }
          : {}),
      },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 422
        ? "Please check the search filters and page number."
        : "The catalog is temporarily unavailable.",
    );
  return response.json() as Promise<T>;
}
export const siteOrigin = process.env.SITE_URL ?? "http://localhost:3000";
export function catalogMetadata(
  title: string,
  description: string,
  path: string,
) {
  return {
    title,
    description,
    alternates: { canonical: new URL(path, siteOrigin).href },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: new URL(path, siteOrigin).href,
      type: "website" as const,
    },
  };
}
