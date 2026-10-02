export type AuthenticationState =
  "authenticated" | "enrollment_required" | "mfa_required";
export function authenticationDestination(
  state: AuthenticationState,
  roles: string[] = [],
): string {
  if (state !== "authenticated") return "/mfa";
  return roles.some((role) =>
    ["owner", "order_processing", "inventory_store"].includes(role),
  )
    ? "/admin"
    : "/account";
}
