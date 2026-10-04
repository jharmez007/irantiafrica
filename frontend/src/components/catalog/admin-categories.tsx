"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Modal, Select } from "@/components/ui";
import { AdminShell } from "@/components/brand/layouts";
import { PageSkeleton } from "@/components/loading";
import {
  ActionMenu,
  AdminTable,
  StatusBadge,
} from "@/components/admin/primitives";
import { catalogAdmin } from "@/lib/catalog-admin-api";
import type { Category } from "@/lib/catalog";
import { allCategories, CatalogAccess } from "./admin-common";
import { toast } from "@/lib/toast";
export function AdminCategories({
  editId,
  create = false,
}: {
  editId?: string;
  create?: boolean;
}) {
  return (
    <CatalogAccess owner>
      <Categories editId={editId} create={create} />
    </CatalogAccess>
  );
}
function Categories({ editId, create }: { editId?: string; create: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Category[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    let active = true;
    allCategories()
      .then((c) => {
        if (active) setItems(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(data: unknown, id?: string) {
    setBusy(true);
    setError("");
    try {
      await catalogAdmin(
        id ? `/categories/${id}` : "/categories",
        id ? "PATCH" : "POST",
        data,
      );
      toast.success(id ? "Category saved" : "Category created");
      router.push("/admin/categories");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Category could not be saved. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const editing = create || !!editId;
  const category = items?.find((c) => c.id === editId);
  return (
    <AdminShell
      title={create ? "Add category" : editId ? "Edit category" : "Categories"}
      description={
        editing
          ? "Organize your products with a clear category name and hierarchy."
          : "Organize your storefront catalog."
      }
      parent={
        editing ? { label: "Categories", href: "/admin/categories" } : undefined
      }
      width={editing ? "form" : "wide"}
      actions={
        !editing ? (
          <Link className="button button--primary" href="/admin/categories/new">
            Add category
          </Link>
        ) : undefined
      }
    >
      {error && <Alert>{error}</Alert>}
      {editing ? (
        <>
          {!items ? (
            <PageSkeleton
              kind="admin-editor"
              label="Loading category editor"
              showHeading={false}
            />
          ) : editId && !category ? (
            <Alert>
              Category not found. Return to Categories and choose an existing
              record.
            </Alert>
          ) : (
            <section className="admin-panel">
              <CategoryForm
                category={category}
                busy={busy}
                items={items}
                save={save}
              />
              <Link
                href="/admin/categories"
                className="button button--secondary"
              >
                Cancel
              </Link>
            </section>
          )}
        </>
      ) : (
        <AdminTable
          label="Categories"
          columns={["Category", "Slug", "Parent", "Status", "Actions"]}
          loading={!items && !error}
          empty={items?.length === 0}
          emptyText="No categories yet. Add a category to organize products."
        >
          {items?.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.name}</th>
              <td>{c.slug}</td>
              <td>{items.find((p) => p.id === c.parent_id)?.name ?? "—"}</td>
              <td>
                <StatusBadge value={c.status ?? "draft"} />
              </td>
              <td>
                <div className="product-row-actions">
                  <Link
                    className="button button--secondary"
                    href={`/admin/categories/${c.id}/edit`}
                  >
                    Edit
                  </Link>
                  <ActionMenu label="More actions" compact>
                    <Link
                      href={
                        "/admin/products?category=" + encodeURIComponent(c.slug)
                      }
                    >
                      View products
                    </Link>
                    {c.delete_eligibility?.allowed && (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => {
                          setDeleteError("");
                          setDeleting(c);
                        }}
                      >
                        Delete category
                      </Button>
                    )}
                  </ActionMenu>
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      <Modal
        open={!!deleting}
        onClose={() => {
          if (!busy) {
            setDeleting(null);
            setDeleteError("");
          }
        }}
        title="Delete category?"
      >
        <p>
          This permanently removes this category. Products must be reassigned or
          removed from it first.
        </p>
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setDeleting(null);
            setDeleteError("");
          }}
        >
          Cancel
        </Button>{" "}
        <Button
          type="button"
          variant="danger"
          loading={busy}
          onClick={async () => {
            if (!deleting) return;
            setBusy(true);
            setDeleteError("");
            try {
              await catalogAdmin(`/categories/${deleting.id}`, "DELETE");
              setItems(await allCategories());
              setDeleting(null);
              toast.success("Category deleted successfully.");
            } catch (e) {
              const message =
                e instanceof Error
                  ? e.message
                  : "Category could not be deleted.";
              setDeleteError(message);
              toast.error("Category could not be deleted.", message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete category"}
        </Button>
      </Modal>
    </AdminShell>
  );
}
function CategoryForm({
  category,
  items,
  busy,
  save,
}: {
  category?: Category;
  items: Category[];
  busy: boolean;
  save: (data: unknown, id?: string) => Promise<void>;
}) {
  return (
    <form
      method="post"
      className="admin-form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save(
          {
            name: f.get("name"),
            status: f.get("status"),
            parent_id: f.get("parent_id") || null,
          },
          category?.id,
        );
      }}
    >
      <label>
        Category name
        <Input
          name="name"
          required
          maxLength={160}
          defaultValue={category?.name}
        />
      </label>
      <label>
        Status
        <Select name="status" defaultValue={category?.status ?? "draft"}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
      </label>
      <label>
        Parent category
        <Select name="parent_id" defaultValue={category?.parent_id ?? ""}>
          <option value="">No parent</option>
          {items
            .filter((c) => c.id !== category?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </label>
      <Button loading={busy} loadingLabel="Saving category…">
        {category ? "Save category" : "Create category"}
      </Button>
      <p>Activate the category when ready to publish products in it.</p>
    </form>
  );
}
