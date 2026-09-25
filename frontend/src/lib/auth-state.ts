export type AuthenticationState =
  "authenticated" | "enrollment_required" | "mfa_required";
export function authenticationDestination(state: AuthenticationState): string {
  return state === "authenticated" ? "/account" : "/mfa";
}
