"use client";
import { AdminShell } from "@/components/brand/layouts";
import { PageSkeleton } from "@/components/loading";
import {
  ActionMenu,
  StatusBadge,
  AdminTable,
} from "@/components/admin/primitives";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Select,
  PasswordInput,
  Modal,
} from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { authRequest, ApiError } from "@/lib/auth-api";
import { catalogAdmin } from "@/lib/catalog-admin-api";
import { toast } from "@/lib/toast";
import { CatalogAccess } from "@/components/catalog/admin-common";
const roles = {
  owner: "Business Owner / Super Admin",
  order_processing: "Order Processing Staff",
  inventory_store: "Inventory / Store Staff",
};
type Staff = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  mfa_enrolled: boolean;
};
type Listing = {
  data: Staff[];
  meta: { page: number; last_page: number; total: number };
  mail_setup: "email" | "local_capture" | "unavailable";
};
export function AdminStaff() {
  return (
    <CatalogAccess owner>
      <StaffScreen />
    </CatalogAccess>
  );
}
function StaffScreen() {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<Listing | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [review, setReview] = useState<{
    person: Staff;
    action: "disable" | "mfa-reset" | "roles";
    role?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    catalogAdmin<Listing>(`/staff?page=${page}&q=${encodeURIComponent(query)}`)
      .then((r) => {
        if (active) {
          setResult(r);
          setReauth(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (e instanceof ApiError && e.status === 403) setReauth(true);
        }
      });
    return () => {
      active = false;
    };
  }, [page, query, reload]);
  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      toast.success(message);
      setReload((x) => x + 1);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed.";
      setError(message);
      toast.error("Staff action failed.", message);
      if (e instanceof ApiError && e.status === 403) setReauth(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminShell
      title="Staff"
      description="Manage staff access and account security."
      actions={
        <Button onClick={() => setAdding(true)} disabled={!result}>
          Add staff
        </Button>
      }
    >
      <div className="admin-workspace">
        {error && <Alert tone="error">{error}</Alert>}
        {!result && !error && (
          <PageSkeleton
            kind="admin-table"
            label="Loading staff"
            showHeading={false}
          />
        )}
        <details className="admin-panel" open={reauth || !result || undefined}>
          <summary>Confirm sensitive actions</summary>
          <p>
            {reauth
              ? "Confirm your sign-in to continue."
              : "Staff changes require your password and a fresh authenticator code within the last five minutes."}
          </p>
          <form
            method="post"
            className="admin-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void run(async () => {
                await authRequest("/auth/reauthenticate", {
                  password: String(f.get("password")),
                  code: String(f.get("code")),
                });
                form.reset();
                setReauth(false);
              }, "Sign-in confirmed.");
            }}
          >
            <label>
              Your password
              <PasswordInput
                name="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              Authenticator code
              <Input
                name="code"
                required
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <Button disabled={busy}>Confirm sign-in</Button>
          </form>
        </details>
        {result && (
          <>
            <Modal
              open={adding}
              onClose={() => {
                if (!busy) setAdding(false);
              }}
              title="Add Staff"
            >
              {error && <Alert>{error}</Alert>}
              <p>
                The staff member sets their own password using setup
                instructions, then enrolls an authenticator.
              </p>
              {result.mail_setup === "unavailable" ? (
                <Alert tone="error">
                  Email delivery is not configured. Configure a local email
                  transport and start the queue worker before inviting staff.
                </Alert>
              ) : result.mail_setup === "local_capture" ? (
                <p>
                  Local development: setup instructions are captured in{" "}
                  <a
                    href="http://127.0.0.1:8025"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mailpit
                  </a>{" "}
                  when Mailpit and the queue worker are running, not sent to a
                  real inbox.
                </p>
              ) : (
                <p>
                  Staff invitations will be sent using the configured email
                  service after the queue worker processes them.
                </p>
              )}
              <form
                method="post"
                className="admin-form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  void run(
                    async () => {
                      await catalogAdmin("/staff", "POST", {
                        name: f.get("name"),
                        email: f.get("email"),
                        role: f.get("role"),
                      });
                      form.reset();
                      setAdding(false);
                    },
                    result.mail_setup === "local_capture"
                      ? "Staff created. Check Mailpit after the identity worker processes the setup message."
                      : "Staff created. Setup instructions queued; inbox delivery is not yet confirmed.",
                  );
                }}
              >
                <label>
                  Name
                  <Input name="name" required maxLength={160} />
                </label>
                <label>
                  Email
                  <Input name="email" type="email" required maxLength={254} />
                </label>
                <label>
                  Role
                  <Select name="role">
                    {Object.entries(roles).map(([code, label]) => (
                      <option value={code} key={code}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button
                  disabled={
                    busy || reauth || result.mail_setup === "unavailable"
                  }
                >
                  Send Invitation
                </Button>
              </form>
            </Modal>
            <form
              method="get"
              className="admin-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(String(new FormData(e.currentTarget).get("q")));
                setPage(1);
              }}
            >
              <label>
                Find staff
                <Input name="q" maxLength={100} />
              </label>
              <Button>Search</Button>
            </form>
            <AdminTable
              label="Staff"
              columns={["Name", "Email", "Role", "Status", "MFA", "Actions"]}
              empty={result.data.length === 0}
              emptyText="No staff match your search."
            >
              {result.data.map((person) => (
                <tr key={person.id}>
                  <th scope="row">{person.name}</th>
                  <td>{person.email}</td>
                  <td>
                    {person.roles
                      .map((r) => roles[r as keyof typeof roles] ?? r)
                      .join(", ")}
                  </td>
                  <td>
                    <StatusBadge
                      value={person.status === "active" ? "active" : "disabled"}
                    />
                  </td>
                  <td>
                    {person.mfa_enrolled ? "Enrolled" : "Enrollment required"}
                  </td>
                  <td>
                    {person.id === user?.id ? (
                      <span>Your account — self-changes restricted</span>
                    ) : (
                      <ActionMenu label="More actions" compact>
                        {person.status === "active" && !person.mfa_enrolled && (
                          <Button
                            variant="secondary"
                            disabled={
                              busy ||
                              reauth ||
                              result.mail_setup === "unavailable"
                            }
                            onClick={() =>
                              void run(
                                () =>
                                  catalogAdmin(
                                    `/staff/${person.id}/resend-invitation`,
                                    "POST",
                                  ).then(() => undefined),
                                "Setup instructions queued again; inbox delivery is not yet confirmed.",
                              )
                            }
                          >
                            Resend setup email
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setReview({
                              person,
                              action: "roles",
                              role: person.roles[0],
                            })
                          }
                        >
                          Change role
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setReview({ person, action: "mfa-reset" })
                          }
                        >
                          Reset MFA
                        </Button>
                        {person.status === "active" && (
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              setReview({ person, action: "disable" })
                            }
                          >
                            Disable staff
                          </Button>
                        )}
                      </ActionMenu>
                    )}
                  </td>
                </tr>
              ))}
            </AdminTable>
            <nav className="admin-pagination" aria-label="Staff pages">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page} of {result.meta.last_page}
              </span>
              <Button
                disabled={page >= result.meta.last_page}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          </>
        )}
        <Modal
          open={!!review}
          onClose={() => {
            if (!busy) setReview(null);
          }}
          title="Confirm staff change"
        >
          {review && (
            <form
              method="post"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await catalogAdmin(
                    `/staff/${review.person.id}/${review.action}`,
                    review.action === "roles" ? "PATCH" : "POST",
                    review.action === "roles"
                      ? { role: f.get("role") }
                      : review.action === "mfa-reset"
                        ? { reason: f.get("reason") }
                        : {},
                  );
                  setReview(null);
                }, "Staff change saved. Existing sessions revoked.");
              }}
            >
              <p>
                {review.person.name} — {review.person.email}
              </p>
              {error && <Alert tone="error">{error}</Alert>}
              {review.action === "roles" ? (
                <label>
                  New role
                  <Select name="role" defaultValue={review.role}>
                    {Object.entries(roles).map(([code, label]) => (
                      <option value={code} key={code}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : review.action === "mfa-reset" ? (
                <>
                  <p>
                    Verify this person’s identity independently. Their existing
                    authenticator and recovery codes will stop working;
                    enrollment will be required again.
                  </p>
                  <label>
                    Reason
                    <Select name="reason">
                      <option value="lost_authenticator">
                        Lost authenticator
                      </option>
                      <option value="suspected_compromise">
                        Suspected compromise
                      </option>
                      <option value="device_replacement">
                        Device replacement
                      </option>
                    </Select>
                  </label>
                </>
              ) : (
                <p>
                  This person will lose account access. The last active owner
                  cannot be disabled.
                </p>
              )}
              <Button
                disabled={reauth}
                loading={busy}
                loadingLabel="Saving change…"
              >
                Confirm change
              </Button>
            </form>
          )}
        </Modal>
      </div>
    </AdminShell>
  );
}
