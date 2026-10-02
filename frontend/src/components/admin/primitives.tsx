"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui";
export function AdminTable({
  label,
  columns,
  children,
  loading = false,
  empty = false,
  emptyText = "No records to show.",
  pagination,
}: {
  label: string;
  columns: string[];
  children?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  pagination?: ReactNode;
}) {
  return (
    <div className="admin-table-block">
      <div
        className="admin-table-scroll"
        role="region"
        aria-label={label}
        tabIndex={0}
        aria-busy={loading}
      >
        <table className="admin-data-table">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="admin-table-loading" role="status">
                    Loading {label.toLowerCase()}…<span className="skeleton" />
                    <span className="skeleton" />
                    <span className="skeleton" />
                  </div>
                </td>
              </tr>
            ) : empty ? (
              <tr>
                <td colSpan={columns.length} className="admin-table-empty">
                  {emptyText}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
      {pagination}
    </div>
  );
}
export function AdminPagination({
  page,
  last,
  busy,
  change,
}: {
  page: number;
  last: number;
  busy?: boolean;
  change: (page: number) => void;
}) {
  return (
    <nav className="admin-pagination" aria-label="Table pages">
      <Button
        variant="secondary"
        disabled={busy || page <= 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {page} of {Math.max(1, last)}
      </span>
      <Button
        variant="secondary"
        disabled={busy || page >= last}
        onClick={() => change(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
export function StatusBadge({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const code = value.toLowerCase().replaceAll(" ", "_");
  const tone = [
    "published",
    "active",
    "paid",
    "delivered",
    "succeeded",
    "approved",
    "ready",
    "enrolled",
  ].includes(code)
    ? "positive"
    : ["failed", "rejected", "disabled", "cancelled"].includes(code)
      ? "negative"
      : [
            "review",
            "payment_review",
            "requires_review",
            "pending_payment",
            "processing",
            "requested",
            "quarantined",
          ].includes(code)
        ? "attention"
        : "neutral";
  return (
    <span className={`admin-status admin-status--${tone}`}>
      <span aria-hidden="true">
        {tone === "positive"
          ? "✓"
          : tone === "negative"
            ? "!"
            : tone === "attention"
              ? "◷"
              : "•"}
      </span>
      {label ??
        value
          .replaceAll("_", " ")
          .toLowerCase()
          .replace(/^./, (c) => c.toUpperCase())}
    </span>
  );
}
export function ActionMenu({
  label = "Actions",
  compact = false,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  label?: string;
  compact?: boolean;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const change = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setLocalOpen(next);
    },
    [onOpenChange],
  );
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    queueMicrotask(() => change(false));
  }, [pathname, change]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) change(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      change(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, change]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const width = panel.current.offsetWidth || 176;
      const height = panel.current.offsetHeight;
      const left = Math.max(
        8,
        Math.min(rect.right - width, window.innerWidth - width - 8),
      );
      const below = rect.bottom + 6;
      const top =
        below + height <= window.innerHeight - 8
          ? below
          : Math.max(8, rect.top - height - 6);
      panel.current.style.top = `${top}px`;
      panel.current.style.left = `${left}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  return (
    <div ref={wrapper} className="admin-action-menu">
      <button
        ref={trigger}
        type="button"
        className={`admin-action-trigger${compact ? " admin-action-trigger--compact" : ""}`}
        aria-label={compact ? "More actions" : label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => change(!open)}
      >
        {!compact && label}
        <span aria-hidden="true"> ⋯</span>
      </button>
      <div
        ref={panel}
        id={panelId}
        className="admin-action-popover"
        hidden={!open}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a, button")) change(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
