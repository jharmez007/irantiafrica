"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authenticationDestination } from "@/lib/auth-state";
import { authRequest, type Identity } from "@/lib/auth-api";
import { useAuth } from "./auth-provider";
import { AuthLayout } from "@/components/brand/layouts";
import {
  Alert,
  Button,
  FormField,
  Input,
  PasswordInput,
} from "@/components/ui";

type Mode = "login" | "register" | "forgot" | "reset";
const titles = {
  login: "Welcome back",
  register: "Create your account",
  forgot: "Recover your password",
  reset: "Choose a new password",
};
const paths = {
  login: "/auth/login",
  register: "/auth/register",
  forgot: "/auth/password/forgot",
  reset: "/auth/password/reset",
};
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recovery = useRef({ email: "", token: "" });
  useEffect(() => {
    if (mode !== "reset" || !window.location.hash) return;
    const values = new URLSearchParams(window.location.hash.slice(1));
    recovery.current = {
      email: values.get("email") ?? "",
      token: values.get("token") ?? "",
    };
    window.history.replaceState(null, "", window.location.pathname);
  }, [mode]);
  useEffect(() => {
    if (!loading && user && (mode === "login" || mode === "register"))
      router.replace(authenticationDestination(user.authentication_state));
  }, [loading, user, mode, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    if (mode === "reset") Object.assign(values, recovery.current);
    try {
      const result = await authRequest<Identity & { message?: string }>(
        paths[mode],
        values,
      );
      if (mode === "login" || mode === "register") {
        await refresh();
        router.replace(authenticationDestination(result.authentication_state));
      } else {
        setMessage(result.message ?? "Request completed.");
        if (mode === "reset") await refresh();
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to complete the request.",
      );
    } finally {
      setBusy(false);
    }
  }
  const introductions = {
    login: "Sign in to your IRANTI Africa account.",
    register: "Begin with your name, email and a password of your own.",
    forgot: "Enter your email to receive password recovery instructions.",
    reset: "Choose a unique password to keep your account secure.",
  };
  return (
    <AuthLayout
      title={titles[mode]}
      eyebrow="Your IRANTI account"
      intro={introductions[mode]}
    >
      <form
        method="post"
        onSubmit={submit}
        className="auth-form form-stack"
        aria-busy={busy}
      >
        {mode === "register" && (
          <FormField label="Name" htmlFor="auth-name">
            <Input
              id="auth-name"
              name="name"
              autoComplete="name"
              required
              maxLength={160}
            />
          </FormField>
        )}
        {mode !== "reset" && (
          <FormField label="Email" htmlFor="auth-email">
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </FormField>
        )}
        {mode !== "forgot" && (
          <FormField label="Password" htmlFor="auth-password">
            <PasswordInput
              id="auth-password"
              name="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "login" ? undefined : 12}
              maxLength={72}
              aria-describedby={
                mode === "login" ? undefined : "password-guidance"
              }
            />
          </FormField>
        )}
        {(mode === "register" || mode === "reset") && (
          <>
            <p id="password-guidance" className="auth-support">
              Use 12–72 characters. A long, unique passphrase works well.
            </p>
            <FormField
              label="Confirm password"
              htmlFor="auth-password-confirmation"
            >
              <PasswordInput
                id="auth-password-confirmation"
                name="password_confirmation"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={72}
              />
            </FormField>
          </>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}
        <div className="form-actions">
          <Button disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send recovery instructions"
                    : "Change password"}
          </Button>
        </div>
      </form>
      <nav aria-label="Account access" className="auth-links">
        {mode !== "login" && <Link href="/login">Sign in</Link>}
        {mode !== "register" && <Link href="/register">Create account</Link>}
        {mode === "login" && (
          <Link href="/forgot-password">Forgot password?</Link>
        )}
      </nav>
    </AuthLayout>
  );
}
