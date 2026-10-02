"use client";
import { StatusBadge } from "@/components/admin/primitives";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Checkbox, Input, Modal } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { catalogAdmin } from "@/lib/catalog-admin-api";
import type { Category, Page, Product } from "@/lib/catalog";

export async function allCategories() {
  const items: Category[] = [];
  for (let page = 1; ; page++) {
    const result = await catalogAdmin<Page<Category>>(
      `/categories?page_size=100&page=${page}`,
    );
    items.push(...result.data);
    if (page >= result.meta.last_page) return items;
  }
}
export function CatalogAccess({
  children,
  owner = false,
}: {
  children: ReactNode;
  owner?: boolean;
}) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking access…</p>;
  if (!user) return <Link href="/login">Sign in to continue</Link>;
  if (user.authentication_state !== "authenticated")
    return <Link href="/mfa">Complete staff verification</Link>;
  if (
    !(owner
      ? user.roles?.includes("owner")
      : user.roles?.some((r) =>
          ["owner", "inventory_store", "order_processing"].includes(r),
        ))
  )
    return <Alert tone="error">You do not have access to this page.</Alert>;
  return <>{children}</>;
}
export function CategoryPicker({
  categories,
  selected,
  change,
}: {
  categories: Category[];
  selected: string[];
  change: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <fieldset className="category-picker">
      <legend>Categories</legend>
      <label>
        Find a category
        <Input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {!categories.length && (
        <p>
          No categories available.{" "}
          <Link href="/admin/categories">Manage categories</Link> first.
        </p>
      )}
      <div className="category-choices">
        {categories
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .map((c) => (
            <label className="checkbox-field" key={c.id}>
              <Checkbox
                checked={selected.includes(c.id!)}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...selected, c.id!]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
              {c.status !== "active" && ` (${c.status})`}
            </label>
          ))}
      </div>
      <p>
        {selected.length} selected. Publication requires at least one active
        category.
      </p>
    </fieldset>
  );
}
export function StockSummary({ product }: { product: Product }) {
  const variants = product.variants.filter((v) => v.status === "active");
  const totals = variants.reduce(
    (a, v) => ({
      on_hand: a.on_hand + (v.inventory?.on_hand ?? 0),
      reserved: a.reserved + (v.inventory?.reserved ?? 0),
      available: a.available + (v.inventory?.available ?? 0),
    }),
    { on_hand: 0, reserved: 0, available: 0 },
  );
  return (
    <span>
      On hand {totals.on_hand} · Reserved {totals.reserved} · Available{" "}
      {totals.available}
      {variants.some((v) => !v.inventory) && " · Opening stock needed"}
    </span>
  );
}
export function ProductStatus({ product }: { product: Product }) {
  return (
    <div className="status-stack">
      <StatusBadge value={product.status ?? "draft"} />
      {product.status !== "archived" &&
        !!product.publication_issues?.length && <Badge>Needs Attention</Badge>}
      {product.status === "published" &&
        !product.variants.some(
          (v) => v.status === "active" && (v.inventory?.available ?? 0) > 0,
        ) && <Badge>Out of Stock</Badge>}
    </div>
  );
}
export function ArchiveDialog({
  product,
  close,
  done,
}: {
  product: Product | null;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open={!!product}
      onClose={() => {
        if (!busy) {
          setError("");
          close();
        }
      }}
      title="Archive this product?"
    >
      <p>
        The product will no longer be available for new purchases. Historical
        orders will remain unchanged.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="secondary" disabled={busy} onClick={close}>
        Keep product
      </Button>{" "}
      <Button
        variant="danger"
        disabled={busy}
        onClick={async () => {
          if (!product) return;
          setBusy(true);
          setError("");
          try {
            await catalogAdmin(`/products/${product.id}/archive`, "POST", {
              content_version: product.content_version,
            });
            await done();
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to archive.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Archiving…" : "Confirm archive"}
      </Button>
    </Modal>
  );
}

export function RestoreDialog({
  product,
  close,
  done,
}: {
  product: Product | null;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function dismiss() {
    if (!busy) {
      setError("");
      close();
    }
  }
  return (
    <Modal open={!!product} onClose={dismiss} title="Restore this product?">
      <p>
        Restore to Draft for review. This does not publish the product or change
        its stock. Product and inventory history remain intact.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="secondary" disabled={busy} onClick={dismiss}>
        Cancel
      </Button>{" "}
      <Button
        disabled={busy}
        onClick={async () => {
          if (!product) return;
          setBusy(true);
          setError("");
          try {
            await catalogAdmin(`/products/${product.id}/restore`, "POST", {
              content_version: product.content_version,
            });
            await done();
            close();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Unable to restore. Reload the product and retry.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Restoring…" : "Restore to Draft"}
      </Button>
    </Modal>
  );
}
