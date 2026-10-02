"use client";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/admin/admin-page";
import { CatalogAccess } from "@/components/catalog/admin-common";
export default function StaffAccount() {
  const { user } = useAuth();
  return (
    <AdminShell title="My staff account" width="form">
      <CatalogAccess>
        <section className="admin-panel">
          <h2>Profile</h2>
          <dl>
            <dt>Name</dt>
            <dd>{user?.name}</dd>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </dl>
          <Link className="button button--secondary" href="/mfa">
            Security / MFA
          </Link>
        </section>
      </CatalogAccess>
    </AdminShell>
  );
}
