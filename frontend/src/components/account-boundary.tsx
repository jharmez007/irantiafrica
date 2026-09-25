"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { Alert, Button } from "@/components/ui";

export function AccountBoundary() {
  const { user, loading, error, refresh, logout } = useAuth();
  const [actionError, setActionError] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user && !error) router.replace("/login");
    if (user && user.authentication_state !== "authenticated")
      router.replace("/mfa");
  }, [loading, user, error, router]);
  if (loading)
    return (
      <main id="main-content" className="account-layout container">
        <p role="status">Loading your account…</p>
      </main>
    );
  if (error)
    return (
      <main id="main-content" className="account-layout container">
        <Alert tone="error">{error}</Alert>
        <Button type="button" onClick={() => void refresh()}>
          Retry
        </Button>
      </main>
    );
  if (!user)
    return (
      <main id="main-content" className="account-layout container">
        <Link href="/login">Sign in to continue</Link>
      </main>
    );
  if (user.authentication_state !== "authenticated")
    return (
      <main id="main-content" className="account-layout container">
        <Link href="/mfa">Complete sign-in</Link>
      </main>
    );
  return (
    <main id="main-content" className="account-layout container">
      <header className="account-header">
        <p className="eyebrow">IRANTI Africa</p>
        <h1>Your account</h1>
        <p>A space for your personal details.</p>
      </header>
      <nav className="account-nav" aria-label="Your account">
        <Link href="/account" aria-current="page">
          Account overview
        </Link>
        <Link href="/account/orders">Order history</Link>
        <Link href="/products">Explore the collection</Link>
        {user.roles?.length ? (
          <>
            <Link href="/admin">Staff access</Link>
            <Link href="/mfa">Account security</Link>
          </>
        ) : null}
      </nav>
      <section
        className="account-panel"
        aria-labelledby="account-details-heading"
      >
        <h2 id="account-details-heading">Personal details</h2>
        <dl className="account-details">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </dl>
        {actionError && <Alert tone="error">{actionError}</Alert>}
        <div className="form-actions">
          <Button
            variant="secondary"
            type="button"
            onClick={async () => {
              try {
                await logout();
                router.replace("/login");
              } catch {
                setActionError("Unable to sign out. Please retry.");
              }
            }}
          >
            Sign out
          </Button>
        </div>
      </section>
    </main>
  );
}
