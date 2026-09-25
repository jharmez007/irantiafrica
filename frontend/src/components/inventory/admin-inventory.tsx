"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Input, Textarea } from "@/components/ui";

import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/auth-api";
import { catalogAdmin } from "@/lib/catalog-admin-api";
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
  const { user, loading } = useAuth();
  const permissions = inventoryPermissions(user?.roles);
  const authorized =
    !loading &&
    user?.authentication_state === "authenticated" &&
    permissions.read;
  const [result, setResult] = useState<InventoryPage<InventoryEntry> | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [listingLoading, setListingLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryEntry | null>(null);
  const [movements, setMovements] =
    useState<InventoryPage<InventoryMovement> | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    Promise.all([
      catalogAdmin<{ data: InventoryEntry }>(`/inventory/${selectedId}`),
      permissions.quantities
        ? catalogAdmin<InventoryPage<InventoryMovement>>(
            `/inventory/${selectedId}/movements?page=${movementPage}&per_page=20`,
          )
        : Promise.resolve(null),
    ])
      .then(([entry, history]) => {
        if (active) {
          setSelected(entry.data);
          setMovements(history);
        }
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load this stock record.",
          );
      });
    return () => {
      active = false;
    };
  }, [authorized, selectedId, permissions.quantities, movementPage, reload]);

  function choose(entry: InventoryEntry) {
    if (selectedId === entry.variant_id) setReload((value) => value + 1);
    setSelectedId(entry.variant_id);
    setSelected(null);
    setMovements(null);
    setMovementPage(1);
    setAmount("");
    setReason("");
    setReview(null);
    previousReview.current = null;
    setError("");
    setNotice("");
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.manage || !selected) return;
    setError("");
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
      setError(
        "Enter a whole-number stock change and a reason. Stock cannot fall below the reserved quantity or exceed 2,147,483,647.",
      );
      return;
    }
    if (!opening && !selected.version) {
      setError("Refresh this stock record before adjusting it.");
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
    setError("");
    setNotice("");
    try {
      await catalogAdmin(review.path, "POST", review.payload, {
        "Idempotency-Key": review.key,
      });
      setReview(null);
      previousReview.current = null;
      setAmount("");
      setReason("");
      setSelected(null);
      setMovements(null);
      setListingLoading(true);
      setReload((value) => value + 1);
      setNotice("Stock change saved. Inventory is being refreshed.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setReview(null);
        previousReview.current = null;
        setSelected(null);
        setMovements(null);
        setListingLoading(true);
        setReload((value) => value + 1);
        setError(
          "The stock record changed or this action is no longer valid. Review the refreshed quantities before confirming a new change.",
        );
      } else {
        setError(
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
      {notice && <Alert tone="success">{notice}</Alert>}
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
          <div className="inventory-table admin-table">
            <table>
              <caption>Stock by product SKU</caption>
              <thead>
                <tr>
                  <th scope="col">Product and SKU</th>
                  <th scope="col">Availability</th>
                  {permissions.quantities && (
                    <>
                      <th scope="col">On hand</th>
                      <th scope="col">Reserved</th>
                      <th scope="col">Available quantity</th>
                      <th scope="col">Low stock</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.data.map((entry) => (
                  <tr key={entry.variant_id}>
                    <th scope="row">
                      <Button
                        disabled={busy || listingLoading}
                        onClick={() => choose(entry)}
                      >
                        {entry.product_name} — {entry.sku}
                      </Button>
                    </th>
                    <td>
                      <Badge>
                        {entry.available ? "In stock" : "Out of stock"}
                      </Badge>
                    </td>
                    {permissions.quantities && (
                      <>
                        <td>
                          {entry.initialized
                            ? entry.on_hand
                            : "Not initialized"}
                        </td>
                        <td>{entry.reserved ?? "—"}</td>
                        <td>{entry.available_quantity ?? "—"}</td>
                        <td>{entry.low_stock ? "Low stock" : "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      {selectedId && !selected && <p role="status">Loading stock record…</p>}
      {selected && (
        <section className="admin-panel">
          <h2>
            {selected.product_name} — {selected.sku}
          </h2>
          <p>
            Product: {selected.product_status}. SKU: {selected.variant_status}.
          </p>
          <p>
            <Badge>{selected.available ? "In stock" : "Out of stock"}</Badge>
          </p>
          {permissions.quantities && (
            <dl className="inventory-summary">
              <dt>On hand</dt>
              <dd>
                {selected.initialized ? selected.on_hand : "Not initialized"}
              </dd>
              <dt>Reserved</dt>
              <dd>{selected.reserved ?? "—"}</dd>
              <dt>Available quantity</dt>
              <dd>{selected.available_quantity ?? "—"}</dd>
              <dt>Low-stock threshold</dt>
              <dd>{selected.low_stock_threshold ?? "—"}</dd>
            </dl>
          )}
          {permissions.manage && selected.initialized !== undefined && (
            <form className="admin-form-grid" onSubmit={prepare}>
              <h3>
                {selected.initialized ? "Adjust stock" : "Record opening stock"}
              </h3>
              <label>
                {selected.initialized ? "Quantity change" : "Opening quantity"}
                <Input
                  name="amount"
                  required
                  inputMode="numeric"
                  value={amount}
                  disabled={busy}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setReview(null);
                    previousReview.current = null;
                  }}
                />
              </label>
              {selected.initialized && (
                <p>
                  Enter a positive quantity to add stock or a negative quantity
                  to remove stock.
                </p>
              )}
              <label>
                Reason
                <Textarea
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
              </label>
              <Button disabled={busy}>Review stock change</Button>
            </form>
          )}
          {permissions.manage && review && (
            <section
              className="admin-panel admin-confirmation"
              aria-label="Review stock change"
            >
              <h3>Confirm stock change</h3>
              <p>SKU: {selected.sku}</p>
              <p>
                Quantity change: {review.delta > 0 ? "+" : ""}
                {review.delta}
              </p>
              <p>New on-hand quantity: {review.after}</p>
              <p>Reason: {review.payload.reason}</p>
              <Button disabled={busy} onClick={() => void confirm()}>
                {busy ? "Saving stock change…" : "Confirm stock change"}
              </Button>
              <Button disabled={busy} onClick={() => setReview(null)}>
                Cancel review
              </Button>
            </section>
          )}
          {permissions.quantities && (
            <section className="admin-panel">
              <h3>Stock movement history</h3>
              {!movements && <p role="status">Loading stock movements…</p>}
              {movements?.data.length === 0 && <p>No stock movements yet.</p>}
              {movements?.data.map((movement) => (
                <article key={movement.id}>
                  <h4>{movement.kind}</h4>
                  <p>
                    <time dateTime={movement.created_at}>
                      {new Date(movement.created_at).toLocaleString("en-NG")}
                    </time>
                  </p>
                  <p>
                    On-hand change: {movement.on_hand_delta}; reserved change:{" "}
                    {movement.reserved_delta}.
                  </p>
                  <p>
                    On hand after: {movement.on_hand_after}; reserved after:{" "}
                    {movement.reserved_after}.
                  </p>
                  <p>
                    {permissions.manage
                      ? movement.reason
                      : "Operational stock movement"}
                  </p>
                  {permissions.manage && movement.actor && (
                    <p>Recorded by: {movement.actor.name}</p>
                  )}
                </article>
              ))}
              {movements && (
                <Pagination
                  label="Movement pagination"
                  meta={movements.meta}
                  busy={busy}
                  go={(next) => {
                    setMovementPage(next);
                    setMovements(null);
                  }}
                />
              )}
            </section>
          )}
        </section>
      )}
    </div>
  );
}
