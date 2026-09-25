import { ApiError, csrfCookie } from "./auth-api";
export async function catalogAdmin<T>(
  path: string,
  method = "GET",
  data?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    ...extraHeaders,
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (method !== "GET") {
    const r = await fetch("/sanctum/csrf-cookie", {
      credentials: "include",
      cache: "no-store",
    });
    if (!r.ok)
      throw new ApiError(r.status, "Unable to start a secure session.");
    headers["X-XSRF-TOKEN"] = csrfCookie(document.cookie);
    if (!(data instanceof FormData))
      headers["Content-Type"] = "application/json";
  }
  const r = await fetch(
    path.startsWith("/api/") ? path : `/api/v1/admin${path}`,
    {
      method,
      credentials: "include",
      cache: "no-store",
      headers,
      body:
        data instanceof FormData
          ? data
          : data === undefined
            ? undefined
            : JSON.stringify(data),
    },
  );
  if (r.status === 204) return undefined as T;
  const body = await r.json();
  if (!r.ok)
    throw new ApiError(
      r.status,
      Object.values(body.error?.fields ?? {})
        .flat()
        .join(" ") ||
        (r.status === 409
          ? "This record changed or its state prevents this action. Reload and review it."
          : r.status === 403
            ? "You do not have permission for this action."
            : "The request failed. Please sign in or try again."),
    );
  return body as T;
}
export async function uploadImage(
  productId: string,
  file: File,
  alt: string,
  variantId?: string,
): Promise<void> {
  const checksum = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const result = await catalogAdmin<{
    data: {
      id: string;
      upload: {
        url: string;
        transport: "local" | "s3-post";
        fields: Record<string, string>;
      };
    };
  }>("/media/uploads", "POST", {
    product_id: productId,
    variant_id: variantId || null,
    mime_type: file.type,
    byte_size: file.size,
    checksum,
    alt_text: alt,
  });
  const { id, upload } = result.data;
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields))
    form.set(key, value);
  form.set("file", file);
  if (upload.transport === "local") {
    await catalogAdmin(upload.url, "POST", form);
  } else {
    const response = await fetch(upload.url, {
      method: "POST",
      body: form,
      credentials: "omit",
    });
    if (!response.ok) throw new Error("Image upload failed.");
  }
  await catalogAdmin(`/media/${id}/complete`, "POST", {});
}
