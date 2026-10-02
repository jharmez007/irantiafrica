"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Modal, Select, Textarea } from "@/components/ui";
import { ActionMenu } from "@/components/admin/primitives";
import { useAuth } from "@/components/auth-provider";
import { catalogAdmin, uploadImage } from "@/lib/catalog-admin-api";
import {
  type Product,
  type Category,
  type Variant,
  type CatalogImage,
} from "@/lib/catalog";
import { nairaToKobo, koboToNaira } from "@/lib/admin-money";
import { toast } from "@/lib/toast";
import { ProductImage } from "./product-image";
import {
  allCategories,
  ArchiveDialog,
  RestoreDialog,
  CatalogAccess,
  CategoryPicker,
  ProductStatus,
  StockSummary,
} from "./admin-common";
type Taxes = {
  data: { code: string; label: string }[];
  development_only: boolean;
};
type PendingRemoval =
  | { kind: "option"; id: string; name: string; contentVersion?: number }
  | {
      kind: "variant";
      id: string;
      choice: string;
      sku: string;
      remove: boolean;
      priceVersion?: number;
    };
export function AdminProductEditor({ id }: { id?: string }) {
  return (
    <CatalogAccess owner={!id}>
      <Editor id={id} />
    </CatalogAccess>
  );
}
function Editor({ id }: { id?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const manage = user?.roles?.includes("owner");
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxes, setTaxes] = useState<Taxes>({
    data: [],
    development_only: false,
  });
  const [taxError, setTaxError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState("general");
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("section") === "pricing"
    ) {
      queueMicrotask(() => setSection("pricing"));
    }
  }, []);
  const [archive, setArchive] = useState(false);
  const [restore, setRestore] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(
    null,
  );
  const [pollError, setPollError] = useState("");
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const dirtyRef = useRef(false);
  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }
  const [generalRevision, setGeneralRevision] = useState(0);
  useEffect(() => {
    let active = true;
    allCategories()
      .then((c) => {
        if (active) setCategories(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (manage)
      catalogAdmin<Taxes>("/tax-categories")
        .then((t) => {
          if (active) setTaxes(t);
        })
        .catch(() => {
          if (active)
            setTaxError(
              "No configured tax categories are available. Ask the configuration owner to publish the approved tax setup. No rate will be assumed.",
            );
        });
    if (id)
      catalogAdmin<{ data: Product }>(`/products/${id}`)
        .then((r) => {
          if (active) setProduct(r.data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [id, manage]);
  const processing = product?.media.some((m) =>
    ["processing", "quarantined"].includes(m.status ?? ""),
  );
  useEffect(() => {
    if (!id || !processing || busy || dirty) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    async function poll() {
      if (!active) return;
      if (!document.hidden && !inFlight.current) {
        try {
          const r = await catalogAdmin<{ data: Product }>(`/products/${id}`);
          if (active && !dirtyRef.current && !inFlight.current) {
            setProduct(r.data);
            if (
              !r.data.media.some((m) =>
                ["processing", "quarantined"].includes(m.status ?? ""),
              )
            )
              toast.info("Image status updated", "Review the gallery below.");
            setPollError("");
            setGeneralRevision((x) => x + 1);
          }
        } catch {
          if (active)
            setPollError(
              "Image status could not be refreshed. Check your connection and try again.",
            );
        }
      }
      if (active && ++count < 60) timer = setTimeout(poll, 3000);
      else if (active)
        setPollError(
          "Image processing is taking longer than expected. Check that the media worker is running, then retry status.",
        );
    }
    timer = setTimeout(poll, 3000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, processing, busy, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function reload() {
    if (id)
      setProduct(
        (await catalogAdmin<{ data: Product }>(`/products/${id}`)).data,
      );
  }
  async function run(action: () => Promise<void>, message = "Saved.") {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      toast.success(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Save failed. Please try again.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function mutate(path: string, method: string, data: unknown) {
    await run(async () => {
      const r = await catalogAdmin<{ data: Product }>(path, method, data);
      setProduct(r.data);
      setGeneralRevision((x) => x + 1);
    });
  }
  const editable = manage && product?.status !== "archived";
  return (
    <div className="admin-workspace product-editor">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/products">Products</Link> /{" "}
        {product?.name ?? "Add Product"}
      </nav>
      {error && (
        <div id="editor-error" ref={errorRef} tabIndex={-1}>
          <Alert tone="error">
            Save failed: {error} Your unsaved form values are retained. For a
            changed record, reload and review before retrying.
          </Alert>
        </div>
      )}
      {id && !product ? (
        <p role="status">Loading product…</p>
      ) : (
        <>
          <Link className="product-back-link" href="/admin/products">
            ← Products
          </Link>
          {product && (
            <div className="admin-toolbar">
              {product.status === "published" && (
                <Link href={`/products/${product.slug}`}>View storefront</Link>
              )}
            </div>
          )}
          {product && (
            <nav
              className="editor-sections"
              role="tablist"
              aria-label="Product sections"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                const keys = ["general", "pricing", "media", "inventory"];
                const current = keys.indexOf(section);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? keys.length - 1
                      : (current +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          keys.length) %
                        keys.length;
                event.preventDefault();
                setSection(keys[next]);
                requestAnimationFrame(() =>
                  document.getElementById(`tab-${keys[next]}`)?.focus(),
                );
              }}
            >
              {[
                ["general", "Details"],
                ["pricing", "Pricing & Variants"],
                ["media", "Images"],
                ["inventory", "Inventory"],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={section === key ? "primary" : "quiet"}
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={section === key}
                  tabIndex={section === key ? 0 : -1}
                  aria-controls={key}
                  onClick={() => setSection(key)}
                >
                  {label}
                </Button>
              ))}
            </nav>
          )}
          <section
            id="general"
            role="tabpanel"
            aria-labelledby="tab-general"
            className="admin-panel editor-section"
            hidden={!!product && section !== "general"}
          >
            <h2>Details</h2>
            {editable ? (
              <General
                key={`${id ?? "new"}:${generalRevision}`}
                product={product}
                categories={categories}
                taxes={taxes}
                taxError={taxError}
                error={error}
                busy={busy}
                dirty={dirty}
                setDirty={markDirty}
                save={async (data) => {
                  await run(async () => {
                    const r = await catalogAdmin<{ data: Product }>(
                      id ? `/products/${id}` : "/products",
                      id ? "PATCH" : "POST",
                      data,
                    );
                    markDirty(false);
                    setProduct(r.data);
                    if (!id)
                      router.push(
                        `/admin/products/${r.data.id}/edit?section=pricing`,
                      );
                    else setGeneralRevision((x) => x + 1);
                  });
                }}
              />
            ) : (
              <>
                <p>{product?.description}</p>
                <p>
                  Tax treatment:{" "}
                  {product?.tax_treatment_label ?? "Needs configuration"}
                </p>
              </>
            )}
            {!id && (
              <p>
                Save the draft first. Then add the SKU, price and images before
                publishing.
              </p>
            )}
          </section>
          {product && (
            <>
              <section
                id="pricing"
                role="tabpanel"
                aria-labelledby="tab-pricing"
                className="admin-panel editor-section"
                hidden={section !== "pricing"}
              >
                <h2>
                  {product.kind === "simple" ? "Pricing" : "Variants & pricing"}
                </h2>
                {dirty && (
                  <p role="status">
                    Save Details changes before editing other sections.
                  </p>
                )}
                {product.kind === "variant" && (
                  <>
                    <p>
                      Add the choices customers can select, such as Colour and
                      Size. Then enter a SKU and naira price for each
                      combination you sell.
                    </p>
                    {product.options.map((o) => (
                      <section
                        className="variant-option"
                        key={o.id}
                        aria-label={`${o.name} option`}
                      >
                        <div className="variant-option-heading">
                          <h3>{o.name}</h3>
                          {editable && !dirty && product.status === "draft" && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy || product.variants.length > 0}
                              onClick={() =>
                                setPendingRemoval({
                                  kind: "option",
                                  id: o.id,
                                  name: o.name,
                                  contentVersion: product.content_version,
                                })
                              }
                            >
                              Remove option
                            </Button>
                          )}
                        </div>
                        <div
                          className="variant-value-list"
                          aria-label={`${o.name} values`}
                        >
                          {o.values.map((v) => (
                            <span className="variant-value-chip" key={v.id}>
                              {v.value}
                              {editable &&
                                !dirty &&
                                product.status === "draft" &&
                                product.variants.length === 0 && (
                                  <button
                                    type="button"
                                    aria-label={`Remove ${o.name} ${v.value}`}
                                    disabled={busy}
                                    onClick={() =>
                                      void mutate(
                                        `/options/${o.id}/values/${v.id}`,
                                        "DELETE",
                                        {
                                          content_version:
                                            product.content_version,
                                        },
                                      )
                                    }
                                  >
                                    <span aria-hidden="true">×</span>
                                  </button>
                                )}
                            </span>
                          ))}
                          {!o.values.length && <span>No values yet.</span>}
                        </div>
                        {product.variants.length > 0 && (
                          <p className="form-help">
                            This option is linked to saved variants. Remove
                            individual variants from sale below; their SKUs and
                            history stay intact.
                          </p>
                        )}
                        {editable && !dirty && (
                          <form
                            method="post"
                            className="admin-inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void mutate(`/options/${o.id}/values`, "POST", {
                                values: [f.get("value")],
                              });
                            }}
                          >
                            <label>
                              Add a value to {o.name}
                              <Input name="value" required maxLength={120} />
                            </label>
                            <Button disabled={busy}>Add value</Button>
                          </form>
                        )}
                      </section>
                    ))}
                    {editable &&
                      !dirty &&
                      product.status === "draft" &&
                      !product.variants.length && (
                        <form
                          method="post"
                          className="admin-form-grid"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void mutate(`/products/${id}/options`, "POST", {
                              name: f.get("name"),
                              values: String(f.get("values"))
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            });
                          }}
                        >
                          <label>
                            Option name
                            <Input
                              name="name"
                              required
                              placeholder="Colour"
                              maxLength={100}
                            />
                          </label>
                          <label>
                            Values, separated by commas
                            <Input
                              name="values"
                              required
                              placeholder="Green, Orange, Cream"
                            />
                          </label>
                          <Button disabled={busy}>Add option</Button>
                        </form>
                      )}
                  </>
                )}
                {product.kind === "variant" && product.variants.length > 0 && (
                  <div
                    className="admin-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Variant summary"
                  >
                    <table className="admin-data-table">
                      <thead>
                        <tr>
                          <th scope="col">Variant</th>
                          <th scope="col">SKU</th>
                          <th scope="col">Price</th>
                          <th scope="col">Status</th>
                          <th scope="col">Stock</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.map((v) => (
                          <tr key={v.id}>
                            <th scope="row">
                              {product.options
                                .map(
                                  (o) =>
                                    o.values.find((value) =>
                                      v.option_value_ids.includes(value.id),
                                    )?.value,
                                )
                                .filter(Boolean)
                                .join(" / ")}
                            </th>
                            <td>{v.sku}</td>
                            <td>₦{koboToNaira(v.unit_price_minor)}</td>
                            <td>
                              {v.status === "active"
                                ? "Active"
                                : "Removed from sale"}
                            </td>
                            <td>
                              On hand {v.inventory?.on_hand ?? 0} · Reserved{" "}
                              {v.inventory?.reserved ?? 0} · Available{" "}
                              {v.inventory?.available ?? 0}
                            </td>
                            <td>
                              {editable && !dirty && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    const remove = v.status === "active";
                                    const choice = product.options
                                      .map(
                                        (o) =>
                                          o.values.find((value) =>
                                            v.option_value_ids.includes(
                                              value.id,
                                            ),
                                          )?.value,
                                      )
                                      .filter(Boolean)
                                      .join(" / ");
                                    setPendingRemoval({
                                      kind: "variant",
                                      id: v.id,
                                      choice,
                                      sku: v.sku,
                                      remove,
                                      priceVersion: v.price_version,
                                    });
                                  }}
                                >
                                  {v.status === "active"
                                    ? "Remove from sale"
                                    : "Restore to sale"}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {product.kind === "variant" && product.variants.length > 0 && (
                  <details className="variant-editors">
                    <summary>
                      Edit existing variant prices and availability
                    </summary>
                    {product.variants.map((v) => (
                      <VariantEditor
                        key={`${v.id}:${v.price_version}`}
                        product={product}
                        variant={v}
                        editable={!!editable && !dirty}
                        busy={busy}
                        save={(data) =>
                          mutate(`/variants/${v.id}`, "PATCH", data)
                        }
                      />
                    ))}
                  </details>
                )}
                {product.kind === "simple" &&
                  product.variants.map((v) => (
                    <VariantEditor
                      key={`${v.id}:${v.price_version}`}
                      product={product}
                      variant={v}
                      editable={!!editable && !dirty}
                      busy={busy}
                      save={(data) =>
                        mutate(`/variants/${v.id}`, "PATCH", data)
                      }
                    />
                  ))}
                {editable &&
                  !dirty &&
                  product.kind === "simple" &&
                  product.variants.length === 0 && (
                    <VariantEditor
                      key={product.variants.length}
                      product={product}
                      editable
                      busy={busy}
                      save={(data) =>
                        mutate(`/products/${id}/variants`, "POST", data)
                      }
                    />
                  )}
                {editable &&
                  !dirty &&
                  product.kind === "variant" &&
                  product.options.length > 0 && (
                    <VariantGenerator
                      product={product}
                      busy={busy}
                      save={async (rows) =>
                        run(async () => {
                          try {
                            for (const row of rows)
                              await catalogAdmin(
                                `/products/${id}/variants`,
                                "POST",
                                row,
                              );
                          } finally {
                            await reload();
                          }
                        }, "Variants created.")
                      }
                    />
                  )}
              </section>
              <section
                id="media"
                role="tabpanel"
                aria-labelledby="tab-media"
                className="admin-panel editor-section"
                hidden={section !== "media"}
              >
                <h2>Product images</h2>
                <p>
                  Add clear images of this product. The first image is used as
                  the main storefront image.
                </p>
                {processing && (
                  <p role="status">
                    Processing image… The gallery updates automatically.
                  </p>
                )}
                {pollError && <Alert tone="error">{pollError}</Alert>}
                {pollError && (
                  <Button
                    variant="secondary"
                    disabled={busy || dirty}
                    onClick={() =>
                      void run(async () => {
                        await reload();
                        setPollError("");
                      }, "Image status updated.")
                    }
                  >
                    Try again
                  </Button>
                )}
                <ImageGallery
                  media={product.media}
                  editable={!!editable && !dirty}
                  busy={busy}
                  update={async (image, data) =>
                    run(async () => {
                      await catalogAdmin(`/media/${image.id}`, "PATCH", data);
                      await reload();
                    })
                  }
                  reorder={async (ordered) =>
                    run(async () => {
                      try {
                        for (const [position, image] of ordered.entries()) {
                          await catalogAdmin(`/media/${image.id}`, "PATCH", {
                            position,
                          });
                        }
                      } finally {
                        await reload();
                      }
                    }, "Image order saved.")
                  }
                  remove={async (image) =>
                    run(async () => {
                      await catalogAdmin(`/media/${image.id}`, "DELETE");
                      await reload();
                    }, "Image removed.")
                  }
                />
                {editable && !dirty && (
                  <Upload
                    busy={busy}
                    upload={async (file, alt) =>
                      run(async () => {
                        await uploadImage(product.id!, file, alt);
                        await reload();
                      }, "Image uploaded. Processing image…")
                    }
                  />
                )}
              </section>
              <section
                id="inventory"
                role="tabpanel"
                aria-labelledby="tab-inventory"
                className="admin-panel editor-section"
                hidden={section !== "inventory"}
              >
                <h2>Inventory</h2>
                <StockSummary product={product} />
                <p>
                  Opening stock and adjustments are recorded in Inventory. Stock
                  is not a publication prerequisite; available stock is required
                  to appear in browsing and search.
                </p>
                <Link
                  className="button button-secondary"
                  href={`/admin/inventory?q=${encodeURIComponent(product.variants[0]?.sku ?? product.name)}&product=${encodeURIComponent(product.id!)}&name=${encodeURIComponent(product.name)}`}
                >
                  Manage inventory
                </Link>
              </section>
              <section
                className="admin-panel editor-summary"
                aria-label="Review and publish"
              >
                <h2>Product status</h2>
                <ProductStatus product={product} />
                <p className="admin-saved-time">
                  Last saved:{" "}
                  {product.updated_at
                    ? new Date(product.updated_at).toLocaleString("en-NG")
                    : "Not recorded"}
                </p>
                {product.status === "published" && (
                  <p>
                    <Link href={`/products/${product.slug}`}>
                      View storefront ↗
                    </Link>
                  </p>
                )}
                {manage && product.status === "archived" && (
                  <Button onClick={() => setRestore(true)}>
                    Restore product
                  </Button>
                )}
                <h3>Publication readiness</h3>
                <PublicationReadiness product={product} />
                {editable && (
                  <div className="editor-publication-actions">
                    <Button
                      disabled={
                        busy ||
                        dirty ||
                        !!product.publication_issues?.length ||
                        product.status === "published"
                      }
                      onClick={() =>
                        void run(async () => {
                          await catalogAdmin(
                            `/products/${id}/publication`,
                            "POST",
                            { content_version: product.content_version },
                          );
                          await reload();
                        }, "Product published.")
                      }
                    >
                      {busy ? "Publishing…" : "Publish product"}
                    </Button>
                  </div>
                )}
                {editable && (
                  <div className="editor-danger-zone">
                    <Button
                      variant="danger"
                      disabled={busy || dirty}
                      onClick={() => setArchive(true)}
                    >
                      Archive product
                    </Button>
                  </div>
                )}
              </section>
              <RestoreDialog
                product={restore ? product : null}
                close={() => setRestore(false)}
                done={async () => {
                  await reload();
                  toast.success(
                    "Product restored to draft",
                    "Review before publishing.",
                  );
                }}
              />
              <Modal
                open={!!pendingRemoval}
                onClose={() => {
                  if (!busy) setPendingRemoval(null);
                }}
                title={
                  pendingRemoval?.kind === "option"
                    ? `Remove ${pendingRemoval.name} option?`
                    : pendingRemoval?.remove
                      ? "Remove variant from sale?"
                      : "Restore variant to sale?"
                }
              >
                {pendingRemoval?.kind === "option" ? (
                  <p>
                    This removes the {pendingRemoval.name} option and all its
                    values from this draft product.
                  </p>
                ) : pendingRemoval ? (
                  <p>
                    {pendingRemoval.remove
                      ? `Remove ${pendingRemoval.choice} (${pendingRemoval.sku}) from sale? Its SKU, stock and commercial history will be retained.`
                      : `Restore ${pendingRemoval.choice} (${pendingRemoval.sku}) to sale? Check its price and stock first.`}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setPendingRemoval(null)}
                >
                  Cancel
                </Button>{" "}
                <Button
                  type="button"
                  variant={
                    pendingRemoval?.kind === "option" || pendingRemoval?.remove
                      ? "danger"
                      : "primary"
                  }
                  disabled={busy}
                  onClick={async () => {
                    const target = pendingRemoval;
                    if (!target) return;
                    if (target.kind === "option") {
                      await run(async () => {
                        const result = await catalogAdmin<{ data: Product }>(
                          `/options/${target.id}`,
                          "DELETE",
                          { content_version: target.contentVersion },
                        );
                        setProduct(result.data);
                        setGeneralRevision((x) => x + 1);
                      });
                    } else {
                      await run(
                        async () => {
                          const result = await catalogAdmin<{ data: Product }>(
                            `/variants/${target.id}`,
                            "PATCH",
                            {
                              status: target.remove ? "archived" : "active",
                              price_version: target.priceVersion,
                            },
                          );
                          setProduct(result.data);
                        },
                        target.remove
                          ? "Variant removed from sale; history retained."
                          : "Variant restored to sale.",
                      );
                    }
                    setPendingRemoval(null);
                  }}
                >
                  {busy
                    ? "Saving…"
                    : pendingRemoval?.kind === "option"
                      ? "Remove option"
                      : pendingRemoval?.remove
                        ? "Remove from sale"
                        : "Restore to sale"}
                </Button>
              </Modal>
              <ArchiveDialog
                product={archive ? product : null}
                close={() => setArchive(false)}
                done={async () => {
                  await reload();
                  toast.success("Product archived");
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
function PublicationReadiness({ product }: { product: Product }) {
  const issues = product.publication_issues ?? [];
  const checks = [
    ["Description", "Add a description."],
    ["Category", "Select at least one active category."],
    ["SKU and price", "Add a complete active variant with a SKU and price."],
    ["Image", "Add an image and wait for it to finish processing."],
    ["Tax treatment", "Choose a configured tax treatment before publishing."],
    ["Variant choices", "Choose a value for every variant option."],
  ] as const;
  const known = checks.map(([, issue]) => issue);
  return (
    <div className="publication-readiness" role="status">
      <ul>
        {checks.map(([label, issue]) => (
          <li key={label}>
            {issues.includes(issue) ? "Needs attention: " : "Ready: "}
            {label}
          </li>
        ))}
        {issues
          .filter((issue) => !known.includes(issue as (typeof known)[number]))
          .map((issue) => (
            <li key={issue}>Needs attention: {issue}</li>
          ))}
      </ul>
      {!product.variants.some(
        (v) => v.status === "active" && (v.inventory?.available ?? 0) > 0,
      ) && (
        <p>
          Stock is not required to publish. This product will appear in browsing
          after available stock is added.
        </p>
      )}
    </div>
  );
}

function ImageGallery({
  media,
  editable,
  busy,
  update,
  reorder,
  remove,
}: {
  media: CatalogImage[];
  editable: boolean;
  busy: boolean;
  update: (
    image: CatalogImage,
    data: { alt_text?: string; position?: number },
  ) => Promise<boolean>;
  reorder: (ordered: CatalogImage[]) => Promise<boolean>;
  remove: (image: CatalogImage) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CatalogImage | null>(null);
  const shown = [...media]
    .filter((m) => !["retired", "rejected"].includes(m.status ?? ""))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  function move(index: number, direction: -1 | 1) {
    const next = [...shown];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    void reorder(next);
  }
  return (
    <>
      {!shown.length && (
        <p role="status">No images yet. Add a product image below.</p>
      )}
      <div className="media-gallery" aria-label="Product image gallery">
        {shown.map((m, index) => (
          <article className="media-tile" key={m.id}>
            <ProductImage image={m} />
            <div className="media-tile-heading">
              <span>{index === 0 ? "Main image" : `Image ${index + 1}`}</span>
              {editable && (
                <ActionMenu label={`Image ${index + 1} actions`}>
                  {index > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => move(index, -1)}
                    >
                      {index === 1 ? "Make main image" : "Move left"}
                    </button>
                  )}
                  {index < shown.length - 1 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => move(index, 1)}
                    >
                      Move right
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(m.id)}
                  >
                    Edit description
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(m)}
                  >
                    Remove image
                  </button>
                </ActionMenu>
              )}
            </div>
            {m.status === "processing" || m.status === "quarantined" ? (
              <p role="status">Processing image…</p>
            ) : null}
            {editing === m.id && (
              <form
                method="post"
                onSubmit={(event) => {
                  event.preventDefault();
                  const description = String(
                    new FormData(event.currentTarget).get("alt_text") ?? "",
                  );
                  void update(m, { alt_text: description }).then((saved) => {
                    if (saved) setEditing(null);
                  });
                }}
              >
                <label>
                  Image description
                  <Input
                    name="alt_text"
                    defaultValue={m.alt_text}
                    required
                    maxLength={500}
                  />
                </label>
                <span className="form-help">
                  Briefly describe the image for accessibility.
                </span>
                <div className="media-tile-actions">
                  <Button disabled={busy}>Save description</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </article>
        ))}
      </div>
      {media.some((m) => m.status === "rejected") && (
        <p role="alert">
          Image processing failed.{" "}
          {editable ? (
            <a href="#image-upload">Retry with a new image</a>
          ) : (
            "A new image is needed."
          )}
        </p>
      )}
      <Modal
        open={!!removing}
        onClose={() => {
          if (!busy) setRemoving(null);
        }}
        title="Remove this image?"
      >
        <p>The image will be removed from this product gallery.</p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setRemoving(null)}
        >
          Cancel
        </Button>{" "}
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (removing) {
              await remove(removing);
              setRemoving(null);
            }
          }}
        >
          {busy ? "Removing…" : "Remove image"}
        </Button>
      </Modal>
    </>
  );
}
function General({
  product,
  categories,
  taxes,
  taxError,
  error,
  busy,
  dirty,
  setDirty,
  save,
}: {
  product: Product | null;
  categories: Category[];
  taxes: Taxes;
  taxError: string;
  error: string;
  busy: boolean;
  dirty: boolean;
  setDirty: (v: boolean) => void;
  save: (data: unknown) => Promise<void>;
}) {
  const [selected, setSelected] = useState(product?.category_ids ?? []);
  return (
    <form
      method="post"
      className="admin-form-grid"
      aria-describedby={error ? "editor-error" : undefined}
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          name: f.get("name"),
          description: f.get("description"),
          ...(f.has("tax_category_code") &&
          f.get("tax_category_code") !== "__keep"
            ? { tax_category_code: f.get("tax_category_code") || null }
            : {}),
          category_ids: selected,
          ...(product
            ? { content_version: product.content_version }
            : { kind: f.get("kind") }),
        });
      }}
    >
      <label>
        Product name
        <Input
          name="name"
          required
          maxLength={200}
          defaultValue={product?.name}
        />
      </label>
      <label>
        Description
        <Textarea
          name="description"
          maxLength={20000}
          defaultValue={product?.description}
          aria-describedby="product-description-help"
        />
      </label>
      <span id="product-description-help" className="form-help">
        Tell customers what the product is and what makes it useful.
      </span>
      {!product && (
        <label>
          Product type
          <Select name="kind">
            <option value="simple">Simple product</option>
            <option value="variant">Product with variants</option>
          </Select>
        </label>
      )}
      <CategoryPicker
        categories={categories}
        selected={selected}
        change={(ids) => {
          setSelected(ids);
          setDirty(true);
        }}
      />
      <details className="product-more-settings">
        <summary>More settings</summary>
        {taxes.data.length === 1 &&
        (!product?.tax_category_code ||
          product.tax_category_code === taxes.data[0].code) ? (
          <p className="form-help">
            Tax treatment: {taxes.data[0].label}. Applied automatically when you
            save.
          </p>
        ) : taxes.data.length > 0 ? (
          <label>
            Tax treatment
            <Select
              name="tax_category_code"
              defaultValue={
                taxes.data.some((t) => t.code === product?.tax_category_code)
                  ? (product?.tax_category_code ?? "")
                  : product?.tax_category_code
                    ? "__keep"
                    : ""
              }
            >
              <option value="">Choose later — draft only</option>
              {product?.tax_category_code &&
                !taxes.data.some(
                  (t) => t.code === product.tax_category_code,
                ) && (
                  <option value="__keep">
                    Previous treatment needs review
                  </option>
                )}
              {taxes.data.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <p className="form-help">
            Tax setup is not available yet. You can save a draft; publishing
            requires a configured treatment.
          </p>
        )}
        {taxes.development_only && (
          <p className="form-help">
            Development / test configuration only — not approved production tax
            policy.
          </p>
        )}
        {taxError && (
          <Alert tone="info">{taxError} You can still save a draft.</Alert>
        )}
      </details>
      <div className="editor-save-bar">
        <span role="status">
          {busy
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : product
                ? "Saved"
                : "New draft"}
        </span>
        <Button disabled={busy}>
          {product ? "Save changes" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}
function VariantEditor({
  product,
  variant,
  editable,
  busy,
  save,
}: {
  product: Product;
  variant?: Variant;
  editable: boolean;
  busy: boolean;
  save: (data: unknown) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [price, setPrice] = useState(
    variant ? koboToNaira(variant.unit_price_minor) : "",
  );
  const label = variant
    ? product.options
        .map(
          (o) =>
            o.values.find((v) => variant.option_value_ids.includes(v.id))
              ?.value,
        )
        .filter(Boolean)
        .join(" / ") || "Simple product"
    : product.kind === "simple"
      ? "SKU and price"
      : "New variant";
  return (
    <form
      method="post"
      className="admin-form-grid variant-row"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const unit_price_minor = nairaToKobo(price);
          void save(
            variant
              ? {
                  unit_price_minor,
                  status: f.get("status"),
                  price_version: variant.price_version,
                }
              : {
                  sku: f.get("sku"),
                  unit_price_minor,
                  option_value_ids: product.options.map((o) => f.get(o.id)),
                },
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid price.");
        }
      }}
    >
      <h3>{label}</h3>
      <label>
        SKU
        <Input
          name="sku"
          required
          maxLength={100}
          defaultValue={variant?.sku}
          disabled={!editable || !!variant}
        />
      </label>
      <label>
        Price (₦)
        <Input
          name="price"
          inputMode="decimal"
          placeholder="4,500.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          disabled={!editable}
          aria-invalid={!!error}
          aria-describedby={error ? `price-${variant?.id ?? "new"}` : undefined}
        />
      </label>
      {error && (
        <div id={`price-${variant?.id ?? "new"}`}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {!variant &&
        product.options.map((o) => (
          <label key={o.id}>
            {o.name}
            <Select name={o.id} required>
              <option value="">Choose {o.name}</option>
              {o.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.value}
                </option>
              ))}
            </Select>
          </label>
        ))}
      {variant && (
        <>
          <label>
            Availability
            <Select
              name="status"
              defaultValue={variant.status}
              disabled={!editable}
            >
              <option value="active">Active</option>
              <option value="archived">Removed from sale</option>
            </Select>
          </label>
          <p>
            On hand {variant.inventory?.on_hand ?? 0} · Reserved{" "}
            {variant.inventory?.reserved ?? 0} · Available{" "}
            {variant.inventory?.available ?? 0}
          </p>
        </>
      )}
      {editable && (
        <Button disabled={busy}>
          {variant
            ? "Save variant changes"
            : product.kind === "simple"
              ? "Save SKU & price"
              : "Create variant combination"}
        </Button>
      )}
    </form>
  );
}
function VariantGenerator({
  product,
  busy,
  save,
}: {
  product: Product;
  busy: boolean;
  save: (
    rows: {
      sku: string;
      unit_price_minor: string;
      option_value_ids: string[];
    }[],
  ) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const all = product.options.reduce<{ ids: string[]; label: string }[]>(
    (combinations, option) =>
      combinations.flatMap((combination) =>
        option.values.map((value) => ({
          ids: [...combination.ids, value.id],
          label: [
            ...(combination.label ? [combination.label] : []),
            value.value,
          ].join(" / "),
        })),
      ),
    [{ ids: [], label: "" }],
  );
  const missing = all.filter(
    (combination) =>
      !product.variants.some(
        (variant) =>
          variant.option_value_ids.length === combination.ids.length &&
          combination.ids.every((id) => variant.option_value_ids.includes(id)),
      ),
  );
  if (product.options.some((option) => !option.values.length))
    return (
      <p role="status">
        Add a value to each option before generating variants.
      </p>
    );
  if (all.length > 100)
    return (
      <Alert tone="info">
        {all.length} combinations exceed the 100-variant limit. Reduce the
        option values before generating variants.
      </Alert>
    );
  if (!missing.length)
    return (
      <p role="status">
        All {all.length} current combination{all.length === 1 ? "" : "s"}{" "}
        already {all.length === 1 ? "has" : "have"} saved SKUs and prices.
        Removed-from-sale variants remain reserved; restore them individually.
      </p>
    );
  return (
    <form
      className="variant-generator"
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          const rows = missing.map((combination, index) => ({
            sku: String(form.get(`sku-${index}`) ?? "").trim(),
            unit_price_minor: nairaToKobo(
              String(form.get(`price-${index}`) ?? ""),
            ),
            option_value_ids: combination.ids,
          }));
          void save(rows);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Check each naira price.",
          );
        }
      }}
    >
      <h3>Generate variants</h3>
      <p>Enter a unique SKU and price for each combination you want to sell.</p>
      <p role="status">
        {all.length} combination{all.length === 1 ? "" : "s"}:{" "}
        {all.length - missing.length} saved, {missing.length} new variant
        {missing.length === 1 ? "" : "s"} to create. Existing SKU and price
        entries will be kept.
      </p>
      <div
        className="admin-table-scroll"
        role="region"
        aria-label="New variant combinations"
        tabIndex={0}
      >
        <table className="admin-data-table">
          <thead>
            <tr>
              <th scope="col">Variant</th>
              <th scope="col">SKU</th>
              <th scope="col">Price (₦)</th>
            </tr>
          </thead>
          <tbody>
            {missing.map((combination, index) => (
              <tr key={combination.ids.join(":")}>
                <th scope="row">{combination.label}</th>
                <td>
                  <label className="sr-only" htmlFor={`sku-${index}`}>
                    SKU for {combination.label}
                  </label>
                  <Input
                    id={`sku-${index}`}
                    name={`sku-${index}`}
                    required
                    maxLength={100}
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`price-${index}`}>
                    Price for {combination.label}
                  </label>
                  <Input
                    id={`price-${index}`}
                    name={`price-${index}`}
                    inputMode="decimal"
                    placeholder="4500.00"
                    required
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button disabled={busy}>
        {busy
          ? "Saving…"
          : `Generate ${missing.length} variant${missing.length === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}
function Upload({
  busy,
  upload,
}: {
  busy: boolean;
  upload: (file: File, alt: string) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  function selectFile(selected: File | null) {
    setFile(selected);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (file) {
      const form = e.currentTarget;
      void upload(file, String(new FormData(form).get("alt_text"))).then(
        (saved) => {
          if (saved) {
            selectFile(null);
            form.reset();
            const fileInput = form.elements.namedItem("image_file");
            if (fileInput instanceof HTMLInputElement) fileInput.value = "";
          }
        },
      );
    }
  }
  return (
    <form
      id="image-upload"
      method="post"
      className="admin-form-grid image-upload"
      onSubmit={submit}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        selectFile(event.dataTransfer.files[0] ?? null);
      }}
    >
      <label>
        Drag an image here or choose an image
        <Input
          type="file"
          name="image_file"
          accept="image/jpeg,image/png,image/webp"
          required={!file}
          onChange={(e) => {
            selectFile(e.target.files?.[0] ?? null);
          }}
        />
      </label>
      <p>JPEG, PNG or WebP. Maximum 10 MB; images are checked before use.</p>
      {file && (
        <p className="selected-image-file" role="status">
          Selected file: {file.name}
        </p>
      )}
      <label>
        Image description
        <Input
          name="alt_text"
          required
          maxLength={500}
          aria-describedby="upload-description-help"
        />
      </label>
      <span id="upload-description-help" className="form-help">
        Briefly describe the image for accessibility.
      </span>
      <Button disabled={busy || !file}>
        {busy ? "Uploading / saving…" : "Upload image"}
      </Button>
    </form>
  );
}
