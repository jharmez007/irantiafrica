"use client";
import { AdminShell } from "@/components/brand/layouts";
import { AdminTable, ActionMenu } from "@/components/admin/primitives";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Select } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { catalogAdmin } from "@/lib/catalog-admin-api";
import {
  type Product,
  type Category,
  type Page,
  priceRange,
} from "@/lib/catalog";
import { ProductImage } from "./product-image";
import { toast } from "@/lib/toast";
import {
  allCategories,
  ArchiveDialog,
  RestoreDialog,
  CatalogAccess,
  ProductStatus,
} from "./admin-common";
export function AdminProducts() {
  return (
    <CatalogAccess>
      <Products />
    </CatalogAccess>
  );
}
function Products() {
  const { user } = useAuth();
  const manage = user?.roles?.includes("owner");
  const [result, setResult] = useState<Page<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("category") ?? ""),
  );
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(() =>
    category ? new URLSearchParams({ category }).toString() : "",
  );
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState<Product | null>(null);
  const [restore, setRestore] = useState<Product | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    allCategories()
      .then((c) => {
        if (active) setCategories(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    catalogAdmin<Page<Product>>(`/products?${params}`)
      .then((r) => {
        if (active) {
          setOpenMenu(null);
          setResult(r);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [query, page, refresh]);
  return (
    <AdminShell
      title="Products"
      description="Manage your storefront catalog."
      actions={
        manage ? (
          <Link className="button button--primary" href="/admin/products/new">
            Add Product
          </Link>
        ) : undefined
      }
    >
      <div className="admin-workspace">
        <form
          method="get"
          className="admin-filters"
          onSubmit={(e) => {
            e.preventDefault();
            const params = new URLSearchParams();
            if (q.trim()) params.set("q", q.trim());
            if (status) params.set("status", status);
            if (category) params.set("category", category);
            setError("");
            setQuery(params.toString());
            setPage(1);
          }}
        >
          <label>
            Search products
            <Input
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Status
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </label>
          <label>
            Category
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <Button>Search</Button>
        </form>
        {error && <Alert tone="error">{error}</Alert>}
        <AdminTable
          label="Products"
          columns={[
            "Product",
            "SKU / variants",
            "Category",
            "Price",
            "Available",
            "Status",
            "Updated",
            "Actions",
          ]}
          loading={!result && !error}
          empty={result?.data.length === 0}
          emptyText="No products match your filters."
        >
          {result?.data.map((p) => (
            <tr key={p.id}>
              <th scope="row">
                <div className="product-table-name">
                  <div className="admin-thumbnail">
                    <ProductImage
                      image={p.media.find((m) => m.status === "ready")}
                    />
                  </div>
                  <Link href={`/admin/products/${p.id}/edit`}>{p.name}</Link>
                </div>
              </th>
              <td>
                {p.variants.length === 1
                  ? p.variants[0].sku
                  : `${p.variants.length} variants`}
              </td>
              <td>
                {p.categories.map((c) => c.name).join(", ") || "None active"}
              </td>
              <td>{priceRange(p)}</td>
              <td>
                {p.variants
                  .filter((v) => v.status === "active")
                  .reduce((sum, v) => sum + (v.inventory?.available ?? 0), 0)}
              </td>
              <td>
                <ProductStatus product={p} />
              </td>
              <td>
                {p.updated_at
                  ? new Date(p.updated_at).toLocaleDateString("en-NG")
                  : "—"}
              </td>
              <td>
                <div className="product-row-actions">
                  <Link
                    className="button button--secondary"
                    href={`/admin/products/${p.id}/edit`}
                  >
                    {manage ? "Edit" : "View details"}
                  </Link>
                  {manage && (
                    <ActionMenu
                      label="More actions"
                      compact
                      open={openMenu === (p.id ?? p.slug)}
                      onOpenChange={(next) =>
                        setOpenMenu(next ? (p.id ?? p.slug) : null)
                      }
                    >
                      {p.status === "published" && (
                        <Link href={`/products/${p.slug}`}>
                          View storefront
                        </Link>
                      )}
                      {manage &&
                        p.status === "draft" &&
                        !p.publication_issues?.length && (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                await catalogAdmin(
                                  `/products/${p.id}/publication`,
                                  "POST",
                                  { content_version: p.content_version },
                                );
                                setRefresh((x) => x + 1);
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Unable to publish.",
                                );
                                setRefresh((x) => x + 1);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Publish
                          </Button>
                        )}
                      {manage && p.status !== "archived" && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => setArchive(p)}
                        >
                          Archive
                        </Button>
                      )}
                      {p.status === "archived" && (
                        <Button type="button" onClick={() => setRestore(p)}>
                          Restore
                        </Button>
                      )}
                    </ActionMenu>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
        <nav className="admin-pagination" aria-label="Product pages">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {result?.meta.last_page ?? 1}
          </span>
          <Button
            disabled={!result || page >= result.meta.last_page}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
        <RestoreDialog
          product={restore}
          close={() => setRestore(null)}
          done={async () => {
            setRefresh((x) => x + 1);
            toast.success(
              "Product restored to draft",
              "Review before publishing.",
            );
          }}
        />
        <ArchiveDialog
          product={archive}
          close={() => setArchive(null)}
          done={async () => {
            setRefresh((x) => x + 1);
            toast.success("Product archived");
          }}
        />
      </div>
    </AdminShell>
  );
}
