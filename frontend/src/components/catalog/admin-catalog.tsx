"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
  Checkbox,
} from "@/components/ui";

import { useAuth } from "@/components/auth-provider";
import { catalogAdmin, uploadImage } from "@/lib/catalog-admin-api";
import {
  type Product,
  type Category,
  type Page,
  canManageCatalog,
  money,
} from "@/lib/catalog";
import { ProductImage } from "./product-image";

async function allAdminCategories(): Promise<Category[]> {
  const categories: Category[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const result = await catalogAdmin<Page<Category>>(
      `/categories?page_size=100&page=${page}`,
    );
    categories.push(...result.data);
    lastPage = result.meta.last_page;
    page++;
  } while (page <= lastPage);
  return categories;
}

export function ProductEditorFields({
  product,
  categories,
}: {
  product?: Product;
  categories: Category[];
}) {
  return (
    <>
      <label>
        Name
        <Input
          name="name"
          required
          maxLength={200}
          defaultValue={product?.name}
        />
      </label>
      {!product && (
        <label>
          Product type
          <Select name="kind">
            <option value="simple">Simple — one SKU</option>
            <option value="variant">Variant — generic options</option>
          </Select>
        </label>
      )}
      <label>
        Description
        <Textarea
          name="description"
          maxLength={20000}
          defaultValue={product?.description}
        />
      </label>
      <label>
        Tax category reference
        <Input
          name="tax_category_code"
          required
          maxLength={64}
          defaultValue={product?.tax_category_code}
        />
      </label>
      <p className="catalog-note">
        Use the agreed reference. This does not set a tax rate.
      </p>
      <fieldset>
        <legend>Categories</legend>
        {product?.category_ids
          ?.filter((id) => !categories.some((category) => category.id === id))
          .map((id) => (
            <input key={id} type="hidden" name="category_ids" value={id} />
          ))}
        {categories.map((c) => (
          <label key={c.id} className="checkbox-field">
            <Checkbox
              name="category_ids"
              value={c.id}
              defaultChecked={product?.category_ids?.includes(c.id!)}
            />
            {c.name} ({c.status})
          </label>
        ))}
      </fieldset>
    </>
  );
}
export function AdminCatalog() {
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<Page<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const manage = canManageCatalog(user?.roles);
  useEffect(() => {
    if (!user || user.authentication_state !== "authenticated") return;
    let active = true;
    Promise.all([
      catalogAdmin<Page<Product>>(`/products?page=${page}`),
      allAdminCategories(),
    ])
      .then(([p, c]) => {
        if (active) {
          setProducts(p);
          setCategories(c);
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load catalog.");
      });
    return () => {
      active = false;
    };
  }, [user, page]);
  async function refresh(id?: string) {
    const [p, c] = await Promise.all([
      catalogAdmin<Page<Product>>(`/products?page=${page}`),
      allAdminCategories(),
    ]);
    setProducts(p);
    setCategories(c);
    if (id)
      setSelected(
        (await catalogAdmin<{ data: Product }>(`/products/${id}`)).data,
      );
  }
  async function run(action: () => Promise<void | string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await action();
      setNotice(message ?? "Saved. Review the current data below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  function submitProduct(e: FormEvent<HTMLFormElement>, product?: Product) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const payload = {
        name: f.get("name"),
        description: f.get("description"),
        tax_category_code: f.get("tax_category_code"),
        category_ids: f.getAll("category_ids"),
        ...(product
          ? { content_version: product.content_version }
          : { kind: f.get("kind") }),
      };
      const p = await catalogAdmin<{ data: Product }>(
        product ? `/products/${product.id}` : "/products",
        product ? "PATCH" : "POST",
        payload,
      );
      await refresh(p.data.id);
    });
  }
  if (loading) return <p role="status">Checking catalog access…</p>;
  if (!user)
    return (
      <p>
        <Link href="/login">Sign in</Link> to access the catalog.
      </p>
    );
  if (user.authentication_state !== "authenticated")
    return (
      <p>
        <Link href="/mfa">Complete staff verification</Link>.
      </p>
    );
  if (
    !user.roles?.some((r) =>
      ["owner", "inventory_store", "order_processing"].includes(r),
    )
  )
    return <Alert tone="error">You do not have catalog access.</Alert>;
  return (
    <div className="catalog-admin admin-workspace">
      <p>
        {manage
          ? "Manage products, categories, variants and images."
          : "Read-only catalog access."}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <section className="admin-panel">
        <h2>Products</h2>
        {products?.data.length === 0 && <p>No products yet.</p>}
        {products?.data.map((p) => (
          <p key={p.id} className="admin-record">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setSelected(
                    (await catalogAdmin<{ data: Product }>(`/products/${p.id}`))
                      .data,
                  );
                })
              }
            >
              {p.name} — <Badge>{p.status}</Badge>
            </Button>
          </p>
        ))}
        <Button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>{" "}
        Page {page}{" "}
        <Button
          disabled={busy || !products || page >= products.meta.last_page}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </section>
      {manage && (
        <section className="admin-panel">
          <h2>Create product</h2>
          <form className="admin-form-grid" onSubmit={(e) => submitProduct(e)}>
            <ProductEditorFields categories={categories} />
            <Button disabled={busy}>Create draft</Button>
          </form>
        </section>
      )}
      {selected && (
        <section
          className="admin-panel"
          key={selected.id + ":" + selected.content_version}
        >
          <h2>
            {selected.name} — <Badge>{selected.status}</Badge>
          </h2>
          <p>Stable URL: /products/{selected.slug}</p>
          {manage && selected.status !== "archived" ? (
            <form
              className="admin-form-grid"
              onSubmit={(e) => submitProduct(e, selected)}
            >
              <ProductEditorFields product={selected} categories={categories} />
              <Button disabled={busy}>Save product</Button>
            </form>
          ) : (
            <p>{selected.description}</p>
          )}
          <h3>Options</h3>
          {selected.options.map((o) => (
            <p key={o.id}>
              {o.name}: {o.values.map((v) => v.value).join(", ")}
            </p>
          ))}
          {manage &&
            selected.kind === "variant" &&
            selected.status === "draft" &&
            selected.variants.length === 0 && (
              <form
                className="admin-form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await catalogAdmin(
                      `/products/${selected.id}/options`,
                      "POST",
                      {
                        name: f.get("name"),
                        values: String(f.get("values"))
                          .split("\n")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      },
                    );
                    await refresh(selected.id);
                  });
                }}
              >
                <label>
                  Option name
                  <Input name="name" required maxLength={100} />
                </label>
                <label>
                  Values (one per line)
                  <Textarea name="values" required />
                </label>
                <Button disabled={busy}>Add option</Button>
                <p>
                  Define every option before adding the first variant. Existing
                  combinations remain stable.
                </p>
              </form>
            )}
          {manage &&
            selected.status !== "archived" &&
            selected.options.map((o) => (
              <form
                className="admin-form-grid"
                key={o.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await catalogAdmin(`/options/${o.id}/values`, "POST", {
                      values: [String(f.get("value"))],
                    });
                    await refresh(selected.id);
                  });
                }}
              >
                <label>
                  Add value to {o.name}
                  <Input name="value" required maxLength={120} />
                </label>
                <Button disabled={busy}>Add option value</Button>
              </form>
            ))}
          <h3>Variants</h3>
          {selected.variants.map((v) => (
            <div key={v.id} className="admin-record">
              <p>
                {v.sku} — {money(v.unit_price_minor)} — {v.status}
              </p>
              {manage && selected.status !== "archived" && (
                <form
                  className="admin-form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await catalogAdmin(`/variants/${v.id}`, "PATCH", {
                        unit_price_minor: f.get("unit_price_minor"),
                        status: f.get("status"),
                        price_version: v.price_version,
                      });
                      await refresh(selected.id);
                    });
                  }}
                >
                  <label>
                    Price in kobo
                    <Input
                      name="unit_price_minor"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      required
                      defaultValue={v.unit_price_minor}
                    />
                  </label>
                  <label>
                    Variant status
                    <Select name="status" defaultValue={v.status}>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </Select>
                  </label>
                  <Button disabled={busy}>Save variant</Button>
                </form>
              )}
            </div>
          ))}
          {manage &&
            selected.status !== "archived" &&
            (selected.kind === "variant" || selected.variants.length === 0) && (
              <form
                className="admin-form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await catalogAdmin(
                      `/products/${selected.id}/variants`,
                      "POST",
                      {
                        sku: f.get("sku"),
                        unit_price_minor: f.get("unit_price_minor"),
                        option_value_ids: selected.options.map((o) =>
                          f.get(o.id),
                        ),
                      },
                    );
                    await refresh(selected.id);
                  });
                }}
              >
                <label>
                  SKU
                  <Input name="sku" required maxLength={100} />
                </label>
                <label>
                  Price in kobo
                  <Input
                    name="unit_price_minor"
                    required
                    inputMode="numeric"
                    pattern="[0-9]+"
                  />
                </label>
                {selected.options.map((o) => (
                  <label key={o.id}>
                    {o.name}
                    <Select name={o.id} required>
                      <option value="">Choose value</option>
                      {o.values.map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.value}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
                <Button disabled={busy}>Add SKU</Button>
              </form>
            )}
          <h3>Images</h3>
          {selected.media.map((m) => (
            <div key={m.id} className="admin-record-media">
              <Badge>{m.status}</Badge>
              <ProductImage image={m} />
              {manage && !["retired", "rejected"].includes(m.status ?? "") && (
                <>
                  <form
                    className="admin-form-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        await catalogAdmin(`/media/${m.id}`, "PATCH", {
                          alt_text: f.get("alt_text"),
                          position: Number(f.get("position")),
                        });
                        await refresh(selected.id);
                      });
                    }}
                  >
                    <label>
                      Alt text
                      <Input
                        name="alt_text"
                        defaultValue={m.alt_text}
                        required
                        maxLength={500}
                      />
                    </label>
                    <label>
                      Display order
                      <Input
                        name="position"
                        type="number"
                        min={0}
                        max={1000}
                        defaultValue={m.position}
                      />
                    </label>
                    <Button disabled={busy}>Save image details</Button>
                  </form>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await catalogAdmin(`/media/${m.id}`, "DELETE");
                        await refresh(selected.id);
                      })
                    }
                  >
                    Retire image
                  </Button>
                </>
              )}
            </div>
          ))}
          {manage && selected.status !== "archived" && (
            <form
              className="admin-form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const file = f.get("file");
                  if (!(file instanceof File) || !file.size)
                    throw new Error("Choose an image.");
                  if (file.size > 10485760)
                    throw new Error("Images must be at most 10 MB.");
                  await uploadImage(
                    selected.id!,
                    file,
                    String(f.get("alt_text")),
                    String(f.get("variant_id")),
                  );
                  await refresh(selected.id);
                  return "Image queued for validation. Refresh processing status shortly.";
                });
              }}
            >
              <label>
                JPEG, PNG or WebP (up to 10 MB)
                <Input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
              </label>
              <label>
                Image description
                <Input name="alt_text" required maxLength={500} />
              </label>
              <label>
                Variant association
                <Select name="variant_id">
                  <option value="">Entire product</option>
                  {selected.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku}
                    </option>
                  ))}
                </Select>
              </label>
              <Button disabled={busy}>Upload image</Button>
            </form>
          )}
          <Button
            disabled={busy}
            onClick={() => void run(() => refresh(selected.id))}
          >
            Refresh processing status
          </Button>
          {manage && selected.status !== "archived" && (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await catalogAdmin(
                      `/products/${selected.id}/publication`,
                      "POST",
                      { content_version: selected.content_version },
                    );
                    await refresh(selected.id);
                  })
                }
              >
                Publish product
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await catalogAdmin(
                      `/products/${selected.id}/archive`,
                      "POST",
                      { content_version: selected.content_version },
                    );
                    await refresh(selected.id);
                  })
                }
              >
                Archive product
              </Button>
            </>
          )}
        </section>
      )}
      <section className="admin-panel">
        <h2>Categories</h2>
        {categories.map((c) => (
          <div key={c.id} className="admin-record">
            {manage ? (
              <form
                className="admin-form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await catalogAdmin(`/categories/${c.id}`, "PATCH", {
                      name: f.get("name"),
                      status: f.get("status"),
                      parent_id: f.get("parent_id") || null,
                    });
                    await refresh(selected?.id);
                  });
                }}
              >
                <label>
                  Category name
                  <Input name="name" defaultValue={c.name} required />
                </label>
                <label>
                  Status
                  <Select name="status" defaultValue={c.status}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </Select>
                </label>
                <label>
                  Parent
                  <Select name="parent_id" defaultValue={c.parent_id ?? ""}>
                    <option value="">No parent</option>
                    {categories
                      .filter((p) => p.id !== c.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </label>
                <Button disabled={busy}>Save category</Button>
              </form>
            ) : (
              <p>
                {c.name} — {c.status}
              </p>
            )}
          </div>
        ))}
        {manage && (
          <form
            className="admin-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await catalogAdmin("/categories", "POST", {
                  name: f.get("name"),
                  status: "draft",
                });
                await refresh();
              });
            }}
          >
            <label>
              New category name
              <Input name="name" required maxLength={160} />
            </label>
            <Button disabled={busy}>Create category draft</Button>
          </form>
        )}
      </section>
    </div>
  );
}
