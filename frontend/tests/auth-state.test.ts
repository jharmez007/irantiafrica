import { describe, expect, it } from "vitest";
import { authenticationDestination } from "../src/lib/auth-state";

describe("authentication transitions", () => {
  it("directs password-only staff to MFA instead of account access", () => {
    expect(authenticationDestination("enrollment_required")).toBe("/mfa");
    expect(authenticationDestination("mfa_required")).toBe("/mfa");
  });
  it("allows completed sessions to reach the account", () => {
    expect(authenticationDestination("authenticated")).toBe("/account");
  });
});
