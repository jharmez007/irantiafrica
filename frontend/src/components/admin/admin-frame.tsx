"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button, Drawer } from "@/components/ui";
import { AppScreenLoader } from "@/components/loading";
import { ActionMenu } from "./primitives";
import { toast } from "@/lib/toast";
const items = [
  {
    group: "Overview",
    label: "Dashboard",
    href: "/admin",
    permission: "reports.orders",
    any: ["reports.sales", "reports.stock"],
    icon: "dashboard",
  },
  {
    group: "Commerce",
    label: "Products",
    href: "/admin/products",
    permission: "catalog.read_internal",
    icon: "box",
  },
  {
    group: "Commerce",
    label: "Categories",
    href: "/admin/categories",
    permission: "catalog.create_update",
    icon: "grid",
  },
  {
    group: "Commerce",
    label: "Inventory",
    href: "/admin/inventory",
    permission: "inventory.read",
    icon: "stock",
  },
  {
    group: "Commerce",
    label: "Orders",
    href: "/admin/orders",
    permission: "orders.read",
    icon: "orders",
  },
  {
    group: "Commerce",
    label: "Payments",
    href: "/admin/payments",
    permission: "payments.reconcile",
    icon: "payment",
  },
  {
    group: "Commerce",
    label: "Returns & refunds",
    href: "/admin/returns",
    permission: "returns.read",
    icon: "return",
  },
  {
    group: "Management",
    label: "Staff",
    href: "/admin/staff",
    permission: "staff.provision",
    icon: "staff",
  },
  {
    group: "Management",
    label: "Reports",
    href: "/admin/reports",
    permission: "reports.orders",
    any: ["reports.sales", "reports.stock"],
    icon: "reports",
  },
  {
    group: "Management",
    label: "Notifications",
    href: "/admin/notifications",
    permission: "audit.read",
    icon: "orders",
  },
];
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    box: "m3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
    grid: "M3 5h18 M3 12h18 M3 19h18",
    stock: "M4 20V10h4v10 M10 20V4h4v16 M16 20V7h4v13",
    orders: "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4",
    payment: "M3 5h18v14H3z M3 10h18 M6 15h4",
    return: "M8 4 3 9l5 5 M3 9h11a6 6 0 0 1 0 12",
    staff:
      "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a6 6 0 0 1 12 0v3 M17 4a4 4 0 0 1 0 8 M18 15a4 4 0 0 1 4 4v2",
    reports: "M4 3v18h17 M8 16l4-5 4 2 5-8",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    collapse: "m14 5-7 7 7 7",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
export function AdminFrame({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("iranti-admin-sidebar");
      queueMicrotask(() => setCollapsed(saved === "collapsed"));
    } catch {}
  }, []);
  const visible =
    user?.authentication_state === "authenticated"
      ? items.filter(
          (i) =>
            (user.permissions ?? []).includes(i.permission) ||
            i.any?.some((p) => user.permissions?.includes(p)),
        )
      : [];
  const role = user?.roles?.includes("owner")
    ? "Business Owner"
    : user?.roles?.includes("order_processing")
      ? "Order Processing"
      : user?.roles?.includes("inventory_store")
        ? "Inventory / Store"
        : "Staff workspace";
  if (loading) return <AppScreenLoader label="Preparing your workspace…" />;
  function nav(mobile = false) {
    return (
      <nav aria-label={mobile ? "Mobile administration" : "Administration"}>
        {["Overview", "Commerce", "Management"].map((group) => (
          <div className="admin-nav-group" key={group}>
            {visible.some((i) => i.group === group) && <p>{group}</p>}
            {visible
              .filter((i) => i.group === group)
              .map((i) => {
                const active =
                  i.href === "/admin"
                    ? pathname === i.href
                    : pathname === i.href || pathname.startsWith(i.href + "/");
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed && !mobile ? i.label : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon name={i.icon} />
                    <span>{i.label}</span>
                    {active && (
                      <span className="admin-current-marker" aria-hidden="true">
                        •
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
    );
  }
  return (
    <div
      className={`admin-frame${collapsed ? " admin-frame--collapsed" : ""}`}
      onKeyDown={(event) => {
        if (!open || event.key !== "Tab") return;
        const drawer = event.currentTarget.querySelector("dialog.drawer[open]");
        if (!drawer?.contains(event.target as Node)) return;
        const stops = drawer.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href]:not([tabindex="-1"])',
        );
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && event.target === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="admin-sidebar">
        <Link
          href="/admin"
          className="admin-sidebar-brand"
          aria-label="Iranti Africa administration"
        >
          <Image
            src="/assets/brand/favicon-original.png"
            alt=""
            width={44}
            height={44}
          />
          <span>
            IRANTI AFRICA<small>Administration</small>
          </span>
        </Link>
        {nav()}
        <div className="admin-sidebar-footer">
          <Link href="/products">View storefront ↗</Link>
          <Button
            variant="quiet"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              try {
                localStorage.setItem(
                  "iranti-admin-sidebar",
                  next ? "collapsed" : "expanded",
                );
              } catch {}
            }}
          >
            <Icon name="collapse" />
            <span>Collapse sidebar</span>
          </Button>
        </div>
      </aside>
      <div className="admin-work-area">
        <header className="admin-topbar">
          <div className="admin-topbar-context">
            <Button
              variant="quiet"
              className="admin-menu-trigger"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
              <span>Menu</span>
            </Button>
            <span className="admin-workspace-label">Workspace</span>
          </div>
          <div className="admin-user">
            <span>
              {user?.name ?? "Administration"}
              <small>{role}</small>
            </span>
            <ActionMenu label="Account">
              <Link href="/admin/account">My account</Link>
              <Link href="/mfa">Security / MFA</Link>
              {user ? (
                <Button
                  type="button"
                  variant="quiet"
                  disabled={busy}
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    try {
                      await logout();
                      router.replace("/login");
                    } catch {
                      toast.error("Unable to sign out. Please try again.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Signing out…" : "Logout"}
                </Button>
              ) : (
                <Link href="/login">Sign in</Link>
              )}
            </ActionMenu>
          </div>
        </header>
        <main id="main-content" className="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Administration">
        <div className="admin-mobile-nav">
          {nav(true)}
          <Link href="/products">View storefront ↗</Link>
        </div>
      </Drawer>
    </div>
  );
}
