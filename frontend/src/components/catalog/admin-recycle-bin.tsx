"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/brand/layouts";
import {
  AdminPagination,
  AdminTable,
  StatusBadge,
} from "@/components/admin/primitives";
import { Alert, Button, Input, Modal, Select } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { catalogAdmin } from "@/lib/catalog-admin-api";
import { toast } from "@/lib/toast";
import type { Page, Product } from "@/lib/catalog";
import { CatalogAccess } from "./admin-common";
import { ProductImage } from "./product-image";

type RestoreResponse = {
  data: Product;
  meta?: { restored_as_draft?: boolean; publication_issues?: string[] };
};

function remaining(product: Product): string {
  if (!product.recycle_expires_at) return "Manual review";
  const milliseconds =
    new Date(product.recycle_expires_at).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(milliseconds / 86_400_000));
  if (milliseconds <= 0) return "Recovery period ended";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function deletionLabel(product: Product): string {
  if (product.purge_status === "blocked") return "Deletion blocked";
  if (product.purge_status === "legacy_review") return "Review required";
  if (
    product.recycle_expires_at &&
    new Date(product.recycle_expires_at).getTime() <= Date.now()
  )
    return "Deletion pending";
  return "Recoverable";
}

function isRestorable(product: Product): boolean {
  return (
    !product.recycle_expires_at ||
    new Date(product.recycle_expires_at).getTime() > Date.now()
  );
}

export function AdminRecycleBin() {
  return (
    <CatalogAccess owner>
      <RecycleBin />
    </CatalogAccess>
  );
}

function RecycleBin() {
  const { user } = useAuth();
  const canRestore = user?.permissions?.includes("catalog.recycle.restore");
  const canPurge = user?.permissions?.includes("catalog.recycle.purge");
  const [result, setResult] = useState<Page<Product> | null>(null);
  const [q, setQ] = useState("");
  const [previousStatus, setPreviousStatus] = useState("");
  const [view, setView] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Product | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Product | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    const parameters = new URLSearchParams(query);
    parameters.set("page", String(page));
    catalogAdmin<Page<Product>>(`/products/recycle-bin?${parameters}`)
      .then((response) => {
        if (active) {
          setResult(response);
          setError("");
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "The Recycle Bin could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [query, page, refresh]);

  const removeRow = (id: string | undefined) => {
    if (!id) return;
    setResult((current) =>
      current
        ? {
            ...current,
            data: current.data.filter((product) => product.id !== id),
            meta: {
              ...current.meta,
              total: Math.max(0, current.meta.total - 1),
            },
          }
        : current,
    );
  };

  return (
    <AdminShell
      title="Recycle Bin"
      description="Products remain here for 30 days before permanent catalogue removal, subject to record-retention and inventory safeguards."
      actions={
        <Link className="button button--secondary" href="/admin/products">
          Back to Products
        </Link>
      }
    >
      <div className="admin-workspace">
        <nav className="catalog-lifecycle-nav" aria-label="Product lifecycle">
          <Link href="/admin/products">Products</Link>
          <Link href="/admin/products/recycle-bin" aria-current="page">
            Recycle Bin <span>{result?.meta.total ?? 0}</span>
          </Link>
        </nav>
        <form
          className="admin-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const parameters = new URLSearchParams();
            if (q.trim()) parameters.set("q", q.trim());
            if (previousStatus)
              parameters.set("previous_status", previousStatus);
            if (view) parameters.set("view", view);
            setQuery(parameters.toString());
            setPage(1);
          }}
        >
          <label>
            Search name or SKU
            <Input value={q} onChange={(event) => setQ(event.target.value)} />
          </label>
          <label>
            Previous status
            <Select
              value={previousStatus}
              onChange={(event) => setPreviousStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </label>
          <label>
            Deletion state
            <Select
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              <option value="">All recycled products</option>
              <option value="recent">Recently removed</option>
              <option value="expiring">Expiring soon</option>
              <option value="pending">Pending permanent deletion</option>
              <option value="blocked">Deletion blocked</option>
              <option value="legacy">Legacy review</option>
            </Select>
          </label>
          <Button>Search</Button>
        </form>
        {error && <Alert tone="error">{error}</Alert>}
        <AdminTable
          label="Recycled products"
          columns={[
            "Product",
            "SKU / variants",
            "Previous status",
            "Removed",
            "Removed by",
            "Time remaining",
            "Deletion status",
            "Actions",
          ]}
          loading={!result && !error}
          empty={result?.data.length === 0}
          emptyText="Your Recycle Bin is empty. Products moved here will remain recoverable for 30 days."
        >
          {result?.data.map((product) => (
            <tr key={product.id}>
              <th scope="row">
                <div className="product-table-name">
                  <div className="admin-thumbnail">
                    <ProductImage
                      image={product.media.find(
                        (media) => media.status === "ready",
                      )}
                    />
                  </div>
                  <span>{product.name}</span>
                </div>
              </th>
              <td>
                {product.variants.length === 1
                  ? product.variants[0].sku
                  : `${product.variants.length} variants`}
              </td>
              <td>
                <StatusBadge value={product.status ?? "draft"} />
              </td>
              <td>
                {product.removed_at
                  ? new Date(product.removed_at).toLocaleDateString("en-NG")
                  : "—"}
              </td>
              <td>{product.removed_by?.name ?? "System / legacy"}</td>
              <td
                className={
                  remaining(product).includes("day") &&
                  Number.parseInt(remaining(product)) <= 7
                    ? "recycle-expiring"
                    : undefined
                }
              >
                {remaining(product)}
              </td>
              <td>
                <StatusBadge
                  value={
                    product.purge_status === "blocked"
                      ? "requires_review"
                      : (product.purge_status ?? "recoverable")
                  }
                  label={deletionLabel(product)}
                />
                {product.purge_block_reason && (
                  <p className="recycle-block-reason">
                    {product.purge_block_reason}
                  </p>
                )}
              </td>
              <td>
                <div className="product-row-actions recycle-actions">
                  {canRestore && isRestorable(product) && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setRestoreTarget(product)}
                    >
                      Restore
                    </Button>
                  )}
                  {canPurge && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        setActionError("");
                        setConfirmation("");
                        setPurgeTarget(product);
                      }}
                    >
                      Delete permanently
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
        {result?.data.length === 0 && (
          <p className="recycle-empty-link">
            <Link href="/admin/products">Return to Products</Link>
          </p>
        )}
        <AdminPagination
          page={page}
          last={result?.meta.last_page ?? 1}
          busy={!result}
          change={setPage}
        />

        <Modal
          open={!!restoreTarget}
          onClose={() => {
            if (!busy) setRestoreTarget(null);
          }}
          title="Restore product?"
        >
          <p>
            <strong>{restoreTarget?.name}</strong> will return to its previous
            catalogue status. Stock quantities and historical records will not
            change.
          </p>
          {restoreTarget?.status === "published" && (
            <p>
              Publication requirements will be checked again. If they no longer
              pass, the product will be restored as Draft.
            </p>
          )}
          {actionError && <Alert tone="error">{actionError}</Alert>}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setRestoreTarget(null)}
          >
            Cancel
          </Button>{" "}
          <Button
            loading={busy}
            onClick={async () => {
              if (!restoreTarget) return;
              setBusy(true);
              setActionError("");
              try {
                const response = await catalogAdmin<RestoreResponse>(
                  `/products/${restoreTarget.id}/restore-removal`,
                  "POST",
                  { content_version: restoreTarget.content_version },
                );
                removeRow(restoreTarget.id);
                setRestoreTarget(null);
                if (response.meta?.restored_as_draft)
                  toast.success(
                    "Product restored as Draft",
                    "It needs attention before it can be published.",
                  );
                else
                  toast.success(
                    "Product restored",
                    `${restoreTarget.name} has been restored to your product catalogue.`,
                  );
              } catch (failure) {
                setActionError(
                  failure instanceof Error
                    ? failure.message
                    : "The product could not be restored.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Restore product
          </Button>
        </Modal>

        <Modal
          open={!!purgeTarget}
          onClose={() => {
            if (!busy) {
              setPurgeTarget(null);
              setConfirmation("");
              setActionError("");
            }
          }}
          title="Permanently delete product?"
        >
          <p>
            <strong>{purgeTarget?.name}</strong> will no longer be recoverable
            from the Recycle Bin. This action cannot be undone.
          </p>
          <p>
            Historical orders, payments, inventory movements and audit records
            will remain retained.
          </p>
          {!purgeTarget?.purge_eligibility?.allowed && (
            <Alert tone="error">
              {purgeTarget?.purge_eligibility?.reason ??
                "This product is not currently eligible for permanent removal."}
            </Alert>
          )}
          {purgeTarget?.purge_eligibility?.allowed && (
            <label>
              Type DELETE to confirm
              <Input
                value={confirmation}
                autoComplete="off"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
          {actionError && <Alert tone="error">{actionError}</Alert>}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setPurgeTarget(null)}
          >
            Cancel
          </Button>{" "}
          {purgeTarget?.purge_eligibility?.allowed && (
            <Button
              variant="danger"
              loading={busy}
              disabled={confirmation !== "DELETE"}
              onClick={async () => {
                if (!purgeTarget) return;
                setBusy(true);
                setActionError("");
                try {
                  await catalogAdmin(`/products/${purgeTarget.id}`, "DELETE", {
                    content_version: purgeTarget.content_version,
                    confirmation,
                  });
                  removeRow(purgeTarget.id);
                  setPurgeTarget(null);
                  setConfirmation("");
                  toast.success(
                    "Product permanently removed",
                    "Protected historical records remain retained.",
                  );
                } catch (failure) {
                  setActionError(
                    failure instanceof Error
                      ? failure.message
                      : "Permanent removal could not be completed.",
                  );
                  setRefresh((value) => value + 1);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete permanently
            </Button>
          )}
        </Modal>
      </div>
    </AdminShell>
  );
}
