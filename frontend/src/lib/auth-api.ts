import type { AuthenticationState } from "./auth-state";
import { reportSessionFailure } from "./session-events";

export type Identity = {
  authentication_state: AuthenticationState;
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  roles?: string[];
  permissions?: string[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function csrfCookie(cookie: string): string {
  const value = cookie
    .split("; ")
    .find((part) => part.startsWith("XSRF-TOKEN="));
  return value ? decodeURIComponent(value.slice("XSRF-TOKEN=".length)) : "";
}
export async function authRequest<T>(
  path: string,
  data?: Record<string, string | boolean>,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (data) {
    const bootstrap = await fetch("/sanctum/csrf-cookie", {
      credentials: "include",
      cache: "no-store",
    });
    if (!bootstrap.ok)
      throw new ApiError(
        bootstrap.status,
        "Unable to start a secure session. Please try again.",
      );
    headers["Content-Type"] = "application/json";
    headers["X-XSRF-TOKEN"] = csrfCookie(document.cookie);
  }
  const response = await fetch(`/api/v1${path}`, {
    method: data ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/register") &&
      !path.startsWith("/auth/mfa/") &&
      path !== "/auth/logout" &&
      path !== "/auth/me"
    )
      reportSessionFailure(response.status, path);
    const fields = body.error?.fields as Record<string, string[]> | undefined;
    const message = fields && Object.values(fields).flat().join(" ");
    throw new ApiError(
      response.status,
      message ||
        (response.status === 401
          ? path === "/auth/login"
            ? "Unable to sign in with these details."
            : "Your session has expired. Please sign in again."
          : response.status === 419
            ? "Your security check expired. Please retry this action."
            : response.status === 429
              ? "Too many attempts. Please wait a minute before trying again."
              : "The request could not be completed. Please try again."),
    );
  }
  return body.data as T;
}
