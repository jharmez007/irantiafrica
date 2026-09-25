"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, authRequest } from "@/lib/auth-api";
import { AdminShell } from "@/components/brand/layouts";
import { Alert } from "@/components/ui";

export function StaffBoundary() {
  const [status, setStatus] = useState("Checking staff access…");
  useEffect(() => {
    let active = true;
    authRequest("/admin/access")
      .then(() => {
        if (active) setStatus("Staff access confirmed.");
      })
      .catch((error: unknown) => {
        if (active)
          setStatus(
            error instanceof ApiError && error.status === 403
              ? "You do not have staff access."
              : error instanceof ApiError && error.status === 401
                ? "Sign in to continue."
                : "Unable to verify access. Please try again.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <AdminShell
      title="Staff workspace"
      description="Your operational tools, together in one place."
    >
      <Alert tone="info">{status}</Alert>
      {status === "Staff access confirmed." && (
        <nav aria-label="Staff tools" className="admin-tool-grid">
          <Link href="/admin/orders" className="admin-panel">
            <h2>Orders</h2>
            <p>Review orders available to your role.</p>
            <span>Open orders →</span>
          </Link>
          <Link href="/admin/catalog" className="admin-panel">
            <h2>Catalog administration</h2>
            <p>Review products, categories, variants and images.</p>
            <span>Open catalog →</span>
          </Link>
          <Link href="/admin/inventory" className="admin-panel">
            <h2>Inventory</h2>
            <p>View stock information available to your role.</p>
            <span>Open inventory →</span>
          </Link>
        </nav>
      )}
      <p className="auth-support">
        <Link href="/account">Your account</Link>
      </p>
    </AdminShell>
  );
}
