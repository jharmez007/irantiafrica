"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, authRequest } from "@/lib/auth-api";
import { useAuth } from "./auth-provider";
import { AuthLayout } from "@/components/brand/layouts";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  PasswordInput,
  Select,
} from "@/components/ui";

export function MfaScreen() {
  const { user, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(
    null,
  );
  const [codes, setCodes] = useState<string[]>([]);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user && !user.roles?.length) router.replace("/account");
  }, [loading, user, router]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      setSetup(await authRequest("/auth/mfa/enroll", {}));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to begin setup.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const data = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    const state = user?.authentication_state;
    try {
      if (state === "enrollment_required") {
        const result = await authRequest<{ recovery_codes: string[] }>(
          "/auth/mfa/confirm",
          data,
        );
        setSetup(null);
        setCodes(result.recovery_codes);
        await refresh();
      } else if (state === "mfa_required") {
        await authRequest("/auth/mfa/challenge", { ...data, recovery });
        await refresh();
        router.replace("/account");
      } else if (data.action === "regenerate") {
        const result = await authRequest<{ recovery_codes: string[] }>(
          "/auth/mfa/recovery-codes",
          { password: data.password, code: data.code },
        );
        setCodes(result.recovery_codes);
        await refresh();
      } else {
        await authRequest("/auth/reauthenticate", {
          password: data.password,
          code: data.code,
        });
        setNotice("Sign-in confirmed.");
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to verify your code.",
      );
      if (failure instanceof ApiError && failure.status === 401) {
        setSetup(null);
        setCodes([]);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <AuthLayout title="Account security">
        <p role="status">Loading account security…</p>
      </AuthLayout>
    );
  if (!user?.roles?.length)
    return (
      <AuthLayout title="Account security">
        <Link href="/login">Sign in</Link>
      </AuthLayout>
    );
  const enrolled = user.authentication_state === "authenticated";
  const enrollment = user.authentication_state === "enrollment_required";
  const title = codes.length
    ? "Save your recovery codes"
    : enrollment
      ? "Secure your staff account"
      : enrolled
        ? "Account security"
        : "Verify your sign-in";
  return (
    <AuthLayout title={title} eyebrow="Account security">
      {codes.length ? (
        <div className="form-stack">
          <p>
            Keep these codes in a safe place. Each works once if you lose access
            to your authenticator. They will not be shown again.
          </p>
          <ul className="recovery-codes">
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            onClick={() => {
              setCodes([]);
              router.replace("/account");
            }}
          >
            I have saved my codes
          </Button>
        </div>
      ) : (
        <div className="form-stack">
          {enrollment && (
            <p>Set up an authenticator app before using staff features.</p>
          )}
          {enrollment && !setup && (
            <Button type="button" disabled={busy} onClick={() => void start()}>
              Set up authenticator
            </Button>
          )}
          {setup && (
            <section
              className="mfa-setup form-stack"
              aria-label="Authenticator setup"
            >
              <p>Scan this code in your authenticator app.</p>
              <Image
                src={setup.qr}
                alt="Authenticator setup QR code"
                width={240}
                height={240}
                unoptimized
              />
              <p>Or enter this setup key manually:</p>
              <code className="mfa-code">{setup.secret}</code>
            </section>
          )}
          {(!enrollment || setup) && (
            <form
              method="post"
              onSubmit={submit}
              className="auth-form form-stack"
              aria-busy={busy}
            >
              {enrolled && (
                <>
                  <p>
                    Use your password and a fresh authenticator code to confirm
                    your sign-in or replace your recovery codes.
                  </p>
                  <FormField label="Password" htmlFor="mfa-password">
                    <PasswordInput
                      id="mfa-password"
                      name="password"
                      autoComplete="current-password"
                      required
                      maxLength={1024}
                    />
                  </FormField>
                  <FormField label="Action" htmlFor="mfa-action">
                    <Select id="mfa-action" name="action">
                      <option value="reauthenticate">Confirm sign-in</option>
                      <option value="regenerate">Replace recovery codes</option>
                    </Select>
                  </FormField>
                </>
              )}
              {!enrollment && !enrolled && (
                <label className="checkbox-field">
                  <Checkbox
                    checked={recovery}
                    onChange={(event) => setRecovery(event.target.checked)}
                  />
                  Use a recovery code
                </label>
              )}
              <FormField
                label={
                  recovery && !enrolled ? "Recovery code" : "Authenticator code"
                }
                htmlFor="mfa-code"
              >
                {recovery ? (
                  <Input
                    key="recovery"
                    id="mfa-code"
                    name="code"
                    type="password"
                    inputMode="text"
                    autoComplete="one-time-code"
                    minLength={32}
                    maxLength={32}
                    required
                    aria-describedby="mfa-code-guidance"
                  />
                ) : (
                  <Input
                    key="authenticator"
                    id="mfa-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    aria-describedby="mfa-code-guidance"
                  />
                )}
              </FormField>
              <p id="mfa-code-guidance" className="auth-support">
                Each authenticator code can be used only once. Wait for the next
                code if you just used one.
              </p>
              <div className="form-actions">
                <Button disabled={busy} type="submit">
                  {busy
                    ? "Checking…"
                    : enrollment
                      ? "Confirm setup"
                      : "Continue"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <nav className="auth-links" aria-label="Account security navigation">
        {enrolled && <Link href="/account">Your account</Link>}
        <Button
          variant="quiet"
          type="button"
          onClick={async () => {
            try {
              await logout();
              setCodes([]);
              setSetup(null);
              router.replace("/login");
            } catch {
              setError("Unable to sign out. Please retry.");
            }
          }}
        >
          Sign out
        </Button>
      </nav>
    </AuthLayout>
  );
}
