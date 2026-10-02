"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AdminTable, StatusBadge } from "@/components/admin/primitives";
import Link from "next/link";
import { Alert, Badge, Button, Input, Textarea, Modal } from "@/components/ui";

import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/auth-api";
import { catalogAdmin } from "@/lib/catalog-admin-api";
import { toast } from "@/lib/toast";
import {
  inventoryPermissions,
  type InventoryEntry,
  type InventoryMovement,
  type InventoryPage,
} from "@/lib/inventory";

type Review = {
  key: string;
  path: string;
  payload:
    | { quantity: number; reason: string }
    | { delta: number; reason: string; expected_version: string };
  delta: number;
  after: number;
};
type InventoryModal = "adjust" | "history" | "stock" | null;

function Pagination({
  meta,
  busy,
  go,
  label,
}: {
  meta: InventoryPage<unknown>["meta"];
  busy: boolean;
  go: (page: number) => void;
  label: string;
}) {
  return (
    <nav className="admin-pagination" aria-label={label}>
      <Button
        disabled={busy || meta.current_page <= 1}
        onClick={() => go(meta.current_page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {meta.current_page} of {Math.max(1, meta.last_page)}
      </span>
      <Button
        disabled={busy || meta.current_page >= meta.last_page}
        onClick={() => go(meta.current_page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export function AdminInventory() {
  const [productContext, setProductContext] = useState<string | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") ?? "";
    queueMicrotask(() => {
      setProductContext(params.get("product"));
      setSearch(q);
      setQuery(q);
      setLocationReady(true);
    });
  }, []);
  const productReturn =
    productContext &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      productContext,
    )
      ? `/admin/products/${productContext}/edit`
      : null;
  const { user, loading } = useAuth();
  const permissions = inventoryPermissions(user?.roles);
  const authorized =
    locationReady &&
    !loading &&
    user?.authentication_state === "authenticated" &&
    permissions.read;
  const [result, setResult] = useState<InventoryPage<InventoryEntry> | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [listingLoading, setListingLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<InventoryModal>(null);
  const [selected, setSelected] = useState<InventoryEntry | null>(null);
  const [movements, setMovements] =
    useState<InventoryPage<InventoryMovement> | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const previousReview = useRef<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const listPath = `/inventory?${new URLSearchParams({ q: query, page: String(page), per_page: "24" })}`;

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    catalogAdmin<InventoryPage<InventoryEntry>>(listPath)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to load inventory.",
          );
      })
      .finally(() => {
        if (active) setListingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authorized, listPath, reload]);

  useEffect(() => {
    if (!authorized || !selectedId) return;
    let active = true;
    catalogAdmin<{ data: InventoryEntry }>(`/inventory/${selectedId}`)
      .then((entry) => {
        if (active) setSelected(entry.data);
      })
      .catch((e: unknown) => {
        if (active)
          setModalError(
            e instanceof Error
              ? e.message
              : "Unable to load this stock record.",
          );
      });
    return () => {
      active = false;
    };
  }, [authorized, selectedId, reload]);

  useEffect(() => {
    if (
      !authorized ||
      !selectedId ||
      modal !== "history" ||
      !permissions.quantities
    )
      return;
    let active = true;
    catalogAdmin<InventoryPage<InventoryMovement>>(
      `/inventory/${selectedId}/movements?page=${movementPage}&per_page=20`,
    )
      .then((history) => {
        if (active) setMovements(history);
      })
      .catch((e: unknown) => {
        if (active)
          setModalError(
            e instanceof Error ? e.message : "Unable to load stock movements.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    authorized,
    selectedId,
    modal,
    permissions.quantities,
    movementPage,
    reload,
  ]);

  function resetModal() {
    setModal(null);
    setSelectedId(null);
    setSelected(null);
    setMovements(null);
    setMovementPage(1);
    setAmount("");
    setReason("");
    setReview(null);
    previousReview.current = null;
    setModalError("");
  }
  function closeModal() {
    if (!busy) resetModal();
  }
  function choose(
    entry: InventoryEntry,
    nextModal: Exclude<InventoryModal, null>,
  ) {
    if (selectedId === entry.variant_id) setReload((value) => value + 1);
    setModal(nextModal);
    setSelectedId(entry.variant_id);
    setSelected(null);
    setMovements(null);
    setMovementPage(1);
    setAmount("");
    setReason("");
    setReview(null);
    previousReview.current = null;
    setModalError("");
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.manage || !selected) return;
    setModalError("");
    const quantity = Number(amount);
    const opening = selected.initialized === false;
    const after = (selected.on_hand ?? 0) + quantity;
    if (
      !/^-?\d+$/.test(amount) ||
      !Number.isSafeInteger(quantity) ||
      Math.abs(quantity) > 2147483647 ||
      quantity === 0 ||
      (opening && quantity < 1) ||
      after < (selected.reserved ?? 0) ||
      after > 2147483647 ||
      !reason.trim()
    ) {
      setModalError(
        "Enter a whole-number stock change and a reason. Stock cannot fall below the reserved quantity or exceed 2,147,483,647.",
      );
      return;
    }
    if (!opening && !selected.version) {
      setModalError("Refresh this stock record before adjusting it.");
      return;
    }
    if (review) return;
    const next: Review = {
      key: crypto.randomUUID(),
      path: `/inventory/${selected.variant_id}/${opening ? "opening" : "adjustments"}`,
      payload: opening
        ? { quantity, reason: reason.trim() }
        : {
            delta: quantity,
            reason: reason.trim(),
            expected_version: selected.version!,
          },
      delta: quantity,
      after,
    };
    if (
      previousReview.current?.path === next.path &&
      JSON.stringify(previousReview.current.payload) ===
        JSON.stringify(next.payload)
    ) {
      next.key = previousReview.current.key;
    }
    previousReview.current = next;
    setReview(next);
  }
  async function confirm() {
    if (!review || !permissions.manage || busy) return;
    setBusy(true);
    setModalError("");
    try {
      await catalogAdmin(review.path, "POST", review.payload, {
        "Idempotency-Key": review.key,
      });
      resetModal();
      setListingLoading(true);
      setReload((value) => value + 1);
      toast.success("Stock change saved", "Inventory is being refreshed.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setReview(null);
        previousReview.current = null;
        setSelected(null);
        setListingLoading(true);
        setReload((value) => value + 1);
        setModalError(
          "The stock record changed or this action is no longer valid. Review the refreshed quantities before confirming a new change.",
        );
      } else {
        setModalError(
          e instanceof Error
            ? e.message
            : "Unable to save the change. Retry the same reviewed change.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Checking inventory access…</p>;
  if (!user)
    return (
      <p>
        <Link href="/login">Sign in</Link> to access inventory.
      </p>
    );
  if (user.authentication_state !== "authenticated")
    return (
      <p>
        <Link href="/mfa">Complete staff verification</Link>.
      </p>
    );
  if (!permissions.read)
    return <Alert tone="error">You do not have inventory access.</Alert>;
  return (
    <div className="catalog-admin admin-workspace">
      {productReturn && (
        <Link className="product-back-link" href={productReturn}>
          ← Back to{" "}
          {result?.data.find((entry) => entry.product_id === productContext)
            ?.product_name ?? "product"}
        </Link>
      )}
      <p>
        {permissions.manage
          ? "Record opening stock and reasoned stock adjustments."
          : permissions.quantities
            ? "Read-only stock quantities and movement history."
            : "Stock availability only."}
      </p>
      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setReview(null);
              setListingLoading(true);
              setReload((value) => value + 1);
            }}
          >
            Refresh inventory
          </Button>
        </Alert>
      )}
      <form
        className="admin-form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search.trim());
          setListingLoading(true);
          setReload((value) => value + 1);
        }}
      >
        <label>
          Search inventory
          <Input
            name="q"
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button disabled={busy}>Search</Button>
      </form>
      {listingLoading && <p role="status">Loading inventory…</p>}
      {!listingLoading && result?.data.length === 0 && (
        <p role="status">No stock records match this search.</p>
      )}
      {result && (
        <>
          <AdminTable
            label="Stock by product SKU"
            columns={[
              "Product",
              "SKU",
              ...(permissions.quantities
                ? ["On hand", "Reserved", "Available", "Low stock"]
                : []),
              "Status",
              "Actions",
            ]}
            loading={listingLoading}
            empty={result.data.length === 0}
          >
            {result.data.map((entry) => (
              <tr key={entry.variant_id}>
                <th scope="row" className="admin-inventory-product">
                  <Button
                    variant="quiet"
                    disabled={busy || listingLoading}
                    onClick={() =>
                      choose(
                        entry,
                        permissions.manage
                          ? "adjust"
                          : permissions.quantities
                            ? "history"
                            : "stock",
                      )
                    }
                  >
                    {entry.product_name} — {entry.sku}
                  </Button>
                </th>
                <td>{entry.sku}</td>
                {permissions.quantities && (
                  <>
                    <td>
                      {entry.initialized ? entry.on_hand : "Not initialized"}
                    </td>
                    <td>{entry.reserved ?? "—"}</td>
                    <td>{entry.available_quantity ?? "—"}</td>
                    <td>{entry.low_stock ? "Low stock" : "—"}</td>
                  </>
                )}
                <td>
                  <StatusBadge
                    value={entry.available ? "active" : "out_of_stock"}
                    label={entry.available ? "In stock" : "Out of stock"}
                  />
                </td>
                <td>
                  <Button
                    variant="secondary"
                    disabled={busy || listingLoading}
                    onClick={() =>
                      choose(entry, permissions.manage ? "adjust" : "stock")
                    }
                  >
                    {permissions.manage ? "Adjust stock" : "View stock"}
                  </Button>
                  {permissions.quantities && (
                    <Button
                      variant="quiet"
                      disabled={busy || listingLoading}
                      onClick={() => choose(entry, "history")}
                    >
                      View history
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pagination
            label="Inventory pagination"
            meta={result.meta}
            busy={busy || listingLoading}
            go={(next) => {
              setPage(next);
              setListingLoading(true);
            }}
          />
        </>
      )}
      {selectedId && (modal === "adjust" || modal === "stock") && (
        <Modal
          open
          onClose={closeModal}
          title={modal === "adjust" ? "Adjust Stock" : "Stock availability"}
          className="inventory-adjust-modal"
        >
          {modalError && <Alert tone="error">{modalError}</Alert>}
          {!selected && !modalError && (
            <p role="status">Loading stock record…</p>
          )}
          {selected && (
            <div className="inventory-modal-content">
              <div className="inventory-modal-context">
                <h3>{selected.product_name}</h3>
                <p>SKU: {selected.sku}</p>
                <p>
                  <Badge>
                    {selected.available ? "In stock" : "Out of stock"}
                  </Badge>
                  <span>
                    Product {selected.product_status}; variant{" "}
                    {selected.variant_status}
                  </span>
                </p>
              </div>
              {permissions.quantities && (
                <dl className="inventory-modal-summary">
                  <div>
                    <dt>On hand</dt>
                    <dd>
                      {selected.initialized
                        ? selected.on_hand
                        : "Not initialized"}
                    </dd>
                  </div>
                  <div>
                    <dt>Reserved</dt>
                    <dd>{selected.reserved ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Available</dt>
                    <dd>{selected.available_quantity ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Low-stock threshold</dt>
                    <dd>{selected.low_stock_threshold ?? "—"}</dd>
                  </div>
                </dl>
              )}
              {modal === "adjust" &&
                permissions.manage &&
                selected.initialized !== undefined &&
                (!review ? (
                  <form className="inventory-adjust-form" onSubmit={prepare}>
                    <div>
                      <label htmlFor="inventory-amount">
                        {selected.initialized
                          ? "Quantity change"
                          : "Opening quantity"}
                      </label>
                      <Input
                        id="inventory-amount"
                        name="amount"
                        type="number"
                        step="1"
                        required
                        aria-describedby="inventory-amount-hint"
                        value={amount}
                        disabled={busy}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (next && !/^-?\d*$/.test(next)) return;
                          setAmount(next);
                          setReview(null);
                          previousReview.current = null;
                        }}
                      />
                      <p id="inventory-amount-hint" className="field-hint">
                        {selected.initialized
                          ? "Use a positive number to add stock or a negative number to remove stock."
                          : "Enter a positive whole number for the opening stock balance."}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="inventory-reason">Reason</label>
                      <Textarea
                        id="inventory-reason"
                        name="reason"
                        required
                        maxLength={500}
                        value={reason}
                        disabled={busy}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setReview(null);
                          previousReview.current = null;
                        }}
                      />
                    </div>
                    <div className="inventory-modal-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={closeModal}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>
                        Review stock change
                      </Button>
                    </div>
                  </form>
                ) : (
                  <section
                    className="inventory-review"
                    aria-labelledby="inventory-review-title"
                  >
                    <h3 id="inventory-review-title">Review stock change</h3>
                    <p>SKU: {selected.sku}</p>
                    <p>
                      Quantity change: {review.delta > 0 ? "+" : ""}
                      {review.delta}
                    </p>
                    <p>New on-hand quantity: {review.after}</p>
                    <p>Reason: {review.payload.reason}</p>
                    <div className="inventory-modal-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setReview(null);
                          setModalError("");
                        }}
                      >
                        Cancel review
                      </Button>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => void confirm()}
                      >
                        {busy ? "Saving stock change…" : "Confirm stock change"}
                      </Button>
                    </div>
                  </section>
                ))}
              {modal === "stock" && (
                <div className="inventory-modal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeModal}
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
      {selectedId && modal === "history" && permissions.quantities && (
        <Modal
          open
          onClose={closeModal}
          title="Stock movement history"
          className="inventory-history-modal"
        >
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <div className="inventory-modal-context">
            <h3>{selected?.product_name ?? "Loading product…"}</h3>
            <p>SKU: {selected?.sku ?? "…"}</p>
          </div>
          {!movements && !modalError && (
            <p role="status">Loading stock movements…</p>
          )}
          {movements && (
            <>
              <AdminTable
                label="Stock movement history"
                columns={[
                  "Date / time",
                  "Movement",
                  "On-hand change",
                  "Reserved change",
                  "On hand after",
                  "Reserved after",
                  "Reason",
                  "Recorded by",
                ]}
                empty={movements.data.length === 0}
                emptyText="No stock movements yet."
              >
                {movements.data.map((movement) => (
                  <tr key={movement.id}>
                    <th scope="row">
                      <time dateTime={movement.created_at}>
                        {new Date(movement.created_at).toLocaleString("en-NG")}
                      </time>
                    </th>
                    <td>{movement.kind.replaceAll("_", " ")}</td>
                    <td>
                      {movement.on_hand_delta > 0 ? "+" : ""}
                      {movement.on_hand_delta}
                    </td>
                    <td>
                      {movement.reserved_delta > 0 ? "+" : ""}
                      {movement.reserved_delta}
                    </td>
                    <td>{movement.on_hand_after}</td>
                    <td>{movement.reserved_after}</td>
                    <td>
                      {permissions.manage
                        ? movement.reason
                        : "Operational stock movement"}
                    </td>
                    <td>
                      {permissions.manage ? (movement.actor?.name ?? "—") : "—"}
                    </td>
                  </tr>
                ))}
              </AdminTable>
              <Pagination
                label="Movement pagination"
                meta={movements.meta}
                busy={busy}
                go={(next) => {
                  setMovementPage(next);
                  setMovements(null);
                  setModalError("");
                }}
              />
            </>
          )}
          <div className="inventory-modal-actions">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
