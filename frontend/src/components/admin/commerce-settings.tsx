"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AdminShell } from "@/components/admin/admin-page";
import { ActionMenu, StatusBadge } from "@/components/admin/primitives";
import { useAuth } from "@/components/auth-provider";
import { Alert, Button, Input, Modal, Price, Select } from "@/components/ui";
import { checkoutRequest } from "@/lib/checkout-api";
import { displayTaxLabel } from "@/lib/business-copy";

type Zone = {
  code: string;
  state_code: string;
  locality_code: string | null;
  active: boolean;
  amount_minor: string;
  provider_label: string;
  service_label: string;
  source_reference: string;
  description?: string | null;
  estimate?: string | null;
};
type Rule = { category: string; label: string; rate: string };
type Payload = {
  rounding: "HALF_UP";
  tax_enabled?: boolean;
  product_rules: Rule[];
  default_tax_category?: string | null;
  delivery_tax: { taxable: boolean; rate: string | null; label: string };
  zones: Zone[];
};
type Configuration = {
  id: string;
  version_code: string;
  development_only: boolean;
  payload: Payload;
};
type Settings = {
  current: Configuration | null;
  baseline_id: string | null;
  states: Record<string, string>;
};
const emptyPayload: Payload = {
  rounding: "HALF_UP",
  tax_enabled: false,
  product_rules: [],
  default_tax_category: null,
  delivery_tax: { taxable: false, rate: null, label: "Not taxable" },
  zones: [],
};
function naira(minor: string) {
  const amount = BigInt(minor);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}
function kobo(major: string) {
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(major))
    throw new Error(
      "Enter a non-negative amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = major.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > 9223372036854775807n) throw new Error("Amount is too large.");
  return amount.toString();
}
function normalizedArea(value: string) {
  return value.trim().replace(/\s+/g, "_").toUpperCase();
}
function displayArea(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
function percentage(rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  if (whole === "1") return "100";
  const hundredths = fraction.padEnd(9, "0").slice(0, 9);
  return `${hundredths.slice(0, 2).replace(/^0+/, "") || "0"}${hundredths.slice(2).replace(/0+$/, "") ? "." + hundredths.slice(2).replace(/0+$/, "") : ""}`;
}
function fraction(percent: string) {
  if (!/^(?:100(?:\.0{1,7})?|(?:\d|[1-9]\d)(?:\.\d{1,7})?)$/.test(percent))
    throw new Error(
      "Enter a percentage from 0 to 100 with up to seven decimal places.",
    );
  const [whole, digits = ""] = percent.split(".");
  const numerator = BigInt(whole) * 10000000n + BigInt(digits.padEnd(7, "0"));
  const text = numerator.toString().padStart(10, "0");
  return `${text.slice(0, -9)}.${text.slice(-9)}`
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}
function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [payload, setPayload] = useState<Payload>(emptyPayload);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const publishing = useRef(false);
  const [reload, setReload] = useState(0);
  const [developmentOnly, setDevelopmentOnly] = useState(false);
  useEffect(() => {
    let active = true;
    checkoutRequest<Settings>("/admin/checkout-configurations/current")
      .then((result) => {
        if (!active) return;
        setSettings(result);
        setPayload(
          structuredClone(
            result.current?.payload
              ? {
                  ...result.current.payload,
                  tax_enabled: result.current.payload.tax_enabled ?? true,
                }
              : emptyPayload,
          ),
        );
        setDevelopmentOnly(result.current?.development_only ?? false);
        setError("");
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load commerce settings.",
          );
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const publish = useCallback(
    async (next: Payload, successMessage?: string) => {
      if (!settings || publishing.current) return false;
      publishing.current = true;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const versionCode = `owner_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const published = await checkoutRequest<{ id: string }>(
          "/admin/checkout-configurations",
          "POST",
          {
            version_code: versionCode,
            expected_current_id: settings.baseline_id,
            development_only: developmentOnly,
            payload: next,
          },
        );
        setPayload(next);
        setSettings((previous) =>
          previous
            ? {
                ...previous,
                baseline_id: published.id,
                current: {
                  id: published.id,
                  version_code: versionCode,
                  development_only: developmentOnly,
                  payload: next,
                },
              }
            : previous,
        );
        setReload((value) => value + 1);
        setNotice(
          successMessage ??
            "Changes saved. New checkout quotes will use the updated settings.",
        );
        return true;
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Configuration could not be published.",
        );
        return false;
      } finally {
        publishing.current = false;
        setBusy(false);
      }
    },
    [settings, developmentOnly],
  );
  return {
    settings,
    payload,
    setPayload,
    error,
    clearError: () => setError(""),
    notice,
    retry: () => {
      setError("");
      setReload((value) => value + 1);
    },
    busy,
    publish,
    developmentOnly,
    setDevelopmentOnly,
  };
}
function Access({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking access…</p>;
  if (!user) return <Link href="/login">Sign in to continue</Link>;
  if (user.authentication_state !== "authenticated")
    return <Link href="/mfa">Complete staff verification</Link>;
  if (
    !user.permissions?.includes("shipping.configure") ||
    !user.permissions?.includes("tax.configure")
  )
    return (
      <Alert tone="error">You do not have access to commerce settings.</Alert>
    );
  return <>{children}</>;
}
export function CommerceSettingsHome() {
  return (
    <Access>
      <AdminShell
        title="Commerce settings"
        description="Manage delivery and tax rules used for new checkouts."
      >
        <div className="commerce-settings-links">
          <Link href="/admin/settings/shipping">
            <strong>Shipping</strong>
            <span>Configure delivery methods, states and charges.</span>
          </Link>
          <Link href="/admin/settings/tax">
            <strong>Tax</strong>
            <span>Configure product treatments and delivery tax.</span>
          </Link>
        </div>
      </AdminShell>
    </Access>
  );
}
export function ShippingSettings() {
  return (
    <Access>
      <ShippingEditor />
    </Access>
  );
}
type ShippingAction = "deactivate" | "archive";
function ShippingActionDialog({
  zone,
  action,
  stateName,
  busy,
  error,
  returnFocusTo,
  onClose,
  onConfirm,
}: {
  zone: Zone;
  action: ShippingAction;
  stateName: string;
  busy: boolean;
  error: string;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const descriptionId = useId();
  const isArchive = action === "archive";
  return (
    <Modal
      open
      title={
        isArchive ? "Archive shipping method?" : "Deactivate shipping method?"
      }
      descriptionId={descriptionId}
      className={`shipping-action-modal shipping-action-modal--${action}`}
      initialFocus="[data-shipping-cancel]"
      returnFocusTo={returnFocusTo}
      lockScroll
      onClose={onClose}
    >
      <div className="shipping-action-dialog">
        <div className="shipping-action-summary">
          <strong>{zone.service_label}</strong>
          <span>
            {stateName}
            {zone.locality_code
              ? ` · ${zone.locality_code.replaceAll("_", " ")}`
              : ""}
          </span>
          <Price value={zone.amount_minor} />
        </div>
        <p id={descriptionId}>
          {isArchive
            ? "This method will no longer be available for new checkout selections. Existing orders will remain unchanged."
            : "This method will no longer be offered for new checkout selections. Existing orders will remain unchanged."}
          {!isArchive && " You can activate it again later."}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="shipping-action-footer">
          <Button
            type="button"
            variant="secondary"
            data-shipping-cancel
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isArchive ? "danger" : "primary"}
            loading={busy}
            loadingLabel={isArchive ? "Archiving…" : "Deactivating…"}
            onClick={onConfirm}
          >
            {isArchive ? "Archive method" : "Deactivate method"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function ShippingEditor() {
  const {
    settings,
    payload,
    error,
    clearError,
    notice,
    retry,
    busy,
    publish,
    developmentOnly,
    setDevelopmentOnly,
  } = useSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const [areaMode, setAreaMode] = useState(false);
  const [editReturnFocus, setEditReturnFocus] = useState<HTMLElement | null>(
    null,
  );
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<{
    zone: Zone;
    action: ShippingAction;
    trigger: HTMLElement;
  } | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [locality, setLocality] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState("");
  const [active, setActive] = useState(true);
  const [fieldError, setFieldError] = useState("");
  const [errorField, setErrorField] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredZones = payload.zones.filter((zone) => {
    if (stateFilter && zone.state_code !== stateFilter) return false;
    if (statusFilter === "active" && !zone.active) return false;
    if (statusFilter === "inactive" && zone.active) return false;
    if (!normalizedSearch) return true;
    return [
      zone.service_label,
      settings?.states[zone.state_code] ?? zone.state_code,
      zone.locality_code?.replaceAll("_", " ") ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
  });
  const abujaZones = filteredZones.filter(
    (zone) => zone.state_code === "FCT" && zone.locality_code,
  );
  const otherZones = filteredZones.filter(
    (zone) => zone.state_code !== "FCT" || !zone.locality_code,
  );
  const filtersActive = !!search || !!stateFilter || statusFilter !== "all";
  function resetFilters() {
    setSearch("");
    setStateFilter("");
    setStatusFilter("all");
  }
  function openConfirm(
    zone: Zone,
    action: ShippingAction,
    trigger: HTMLElement,
  ) {
    const menuTrigger = trigger
      .closest(".admin-action-menu")
      ?.querySelector<HTMLElement>(".admin-action-trigger");
    setConfirm({ zone, action, trigger: menuTrigger ?? trigger });
    setConfirmationError("");
    clearError();
  }
  function edit(zone?: Zone, trigger?: HTMLElement, asArea = false) {
    setEditReturnFocus(trigger ?? null);
    setEditing(zone?.code ?? "new");
    setAreaMode(asArea);
    setName(
      asArea && zone?.locality_code
        ? displayArea(zone.locality_code)
        : (zone?.service_label ?? ""),
    );
    setState(zone?.state_code ?? (asArea ? "FCT" : ""));
    setLocality(zone?.locality_code ?? "");
    setAmount(zone ? naira(zone.amount_minor) : "");
    setDescription(zone?.description ?? "");
    setEstimate(zone?.estimate ?? "");
    setActive(zone?.active ?? true);
    setFieldError("");
    setErrorField("");
    clearError();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || !editing || busy) return;
    try {
      if (!name.trim()) {
        setErrorField(areaMode ? "area" : "name");
        throw new Error(
          areaMode ? "Area name is required." : "Method name is required.",
        );
      }
      if (!state) {
        setErrorField("state");
        throw new Error("Choose a state.");
      }
      setErrorField("price");
      const amountMinor = kobo(amount);
      setErrorField("");
      const old = payload.zones.find((zone) => zone.code === editing);
      const area = normalizedArea(areaMode ? name : locality);
      if (area && !/^[A-Z0-9_-]{1,120}$/.test(area)) {
        setErrorField("area");
        throw new Error(
          "Use letters, numbers, spaces or hyphens for the delivery area.",
        );
      }
      if (
        active &&
        area &&
        payload.zones.some(
          (item) =>
            item.code !== old?.code &&
            item.active &&
            item.state_code === state &&
            normalizedArea(item.locality_code ?? "") === area,
        )
      ) {
        setErrorField("area");
        throw new Error(
          "An active delivery rate already exists for this area.",
        );
      }
      const zone: Zone = {
        code:
          old?.code ??
          `METHOD_${crypto.randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
        state_code: state,
        locality_code: area || null,
        active,
        amount_minor: amountMinor,
        provider_label: old?.provider_label ?? "Merchant delivery",
        service_label: name.trim(),
        source_reference: old?.source_reference ?? "Owner configuration",
        description: description.trim() || null,
        estimate: estimate.trim() || null,
      };
      const next = {
        ...payload,
        zones: old
          ? payload.zones.map((item) => (item.code === old.code ? zone : item))
          : [...payload.zones, zone],
      };
      if (await publish(next)) setEditing(null);
    } catch (failure) {
      setFieldError(
        failure instanceof Error ? failure.message : "Check the method fields.",
      );
    }
  }
  async function confirmedChange() {
    if (!confirm || busy) return;
    const selected = payload.zones.find(
      (zone) => zone.code === confirm.zone.code,
    );
    if (!selected) {
      setConfirmationError(
        "This method is no longer available. Refresh the page before retrying.",
      );
      return;
    }
    const zones =
      confirm.action === "archive"
        ? payload.zones.filter((zone) => zone.code !== confirm.zone.code)
        : payload.zones.map((zone) =>
            zone.code === confirm.zone.code ? { ...zone, active: false } : zone,
          );
    if (
      await publish(
        { ...payload, zones },
        confirm.action === "archive"
          ? "Shipping method archived."
          : "Shipping method deactivated.",
      )
    ) {
      const focusFallback =
        confirm.action === "archive" || statusFilter === "active";
      setConfirm(null);
      if (focusFallback)
        window.setTimeout(() => addButtonRef.current?.focus(), 0);
    }
  }
  async function activate(code: string) {
    if (busy) return;
    const zones = payload.zones.map((zone) =>
      zone.code === code ? { ...zone, active: true } : zone,
    );
    await publish({ ...payload, zones }, "Shipping method activated.");
  }
  return (
    <AdminShell
      title="Shipping"
      description="Manage delivery methods, locations and charges."
      parent={{ label: "Commerce settings", href: "/admin/settings" }}
      actions={
        <Button
          ref={addButtonRef}
          type="button"
          onClick={(event) => edit(undefined, event.currentTarget)}
          disabled={busy || !settings}
        >
          Add shipping method
        </Button>
      }
    >
      <div className="commerce-settings-body">
        {error && settings && !editing && !confirm && (
          <Alert tone="error">{error}</Alert>
        )}
        {notice && <p role="status">{notice}</p>}
        {!settings ? (
          error ? (
            <div className="shipping-page-state">
              <Alert tone="error">{error}</Alert>
              <Button type="button" variant="secondary" onClick={retry}>
                Retry loading methods
              </Button>
            </div>
          ) : (
            <p role="status">Loading shipping methods…</p>
          )
        ) : (
          <>
            <p>
              Changes apply to new checkout quotes. Existing orders are
              unchanged.
            </p>
            {(!filtersActive || abujaZones.length > 0) &&
              (!stateFilter || stateFilter === "FCT") && (
                <section
                  className="shipping-areas-panel"
                  aria-labelledby="abuja-areas-heading"
                >
                  <div className="shipping-areas-heading">
                    <div>
                      <p>Nigeria · Federal Capital Territory</p>
                      <h2 id="abuja-areas-heading">Abuja delivery areas</h2>
                      <span>Configure delivery prices by Abuja area.</span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(event) =>
                        edit(undefined, event.currentTarget, true)
                      }
                      disabled={busy}
                    >
                      Add delivery area
                    </Button>
                  </div>
                  {abujaZones.length > 0 ? (
                    <ul
                      className="shipping-area-list"
                      aria-label="Abuja delivery areas"
                    >
                      {abujaZones.map((zone) => (
                        <li key={zone.code}>
                          <div>
                            <strong>{displayArea(zone.locality_code!)}</strong>
                            {zone.description && (
                              <span>{zone.description}</span>
                            )}
                          </div>
                          <strong className="price">
                            <Price value={zone.amount_minor} />
                          </strong>
                          <StatusBadge
                            value={zone.active ? "active" : "inactive"}
                          />
                          <div className="shipping-method-actions">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={(event) =>
                                edit(zone, event.currentTarget, true)
                              }
                              disabled={busy}
                            >
                              Edit
                            </Button>
                            <ActionMenu
                              label={`More actions for ${displayArea(zone.locality_code!)}`}
                              compact
                            >
                              {zone.active ? (
                                <Button
                                  type="button"
                                  variant="quiet"
                                  onClick={(event) =>
                                    openConfirm(
                                      zone,
                                      "deactivate",
                                      event.currentTarget,
                                    )
                                  }
                                  disabled={busy}
                                >
                                  Deactivate
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="quiet"
                                  onClick={() => void activate(zone.code)}
                                  disabled={busy}
                                >
                                  Activate
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="danger"
                                onClick={(event) =>
                                  openConfirm(
                                    zone,
                                    "archive",
                                    event.currentTarget,
                                  )
                                }
                                disabled={busy}
                              >
                                Archive
                              </Button>
                            </ActionMenu>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="shipping-areas-empty">
                      No Abuja delivery areas are configured yet.
                    </p>
                  )}
                </section>
              )}
            <div className="shipping-list-heading">
              <h2>Other State delivery methods</h2>
            </div>
            <div
              className="shipping-filters"
              role="search"
              aria-label="Find shipping methods"
            >
              <label>
                Search methods or locations
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by method or location"
                />
              </label>
              <label>
                State
                <Select
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value)}
                >
                  <option value="">All states</option>
                  {Object.entries(settings.states).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                Status
                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </label>
              {filtersActive && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetFilters}
                >
                  Reset filters
                </Button>
              )}
            </div>
            {payload.zones.length === 0 ? (
              <div className="shipping-page-state">
                <p>No shipping methods are configured yet.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={(event) => edit(undefined, event.currentTarget)}
                  disabled={busy}
                >
                  Create a shipping method
                </Button>
              </div>
            ) : filteredZones.length === 0 ? (
              <div className="shipping-page-state">
                <p>No shipping methods match your search or filters.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetFilters}
                >
                  Clear search and filters
                </Button>
              </div>
            ) : otherZones.length > 0 ? (
              <div className="shipping-methods">
                <div className="shipping-methods-heading" aria-hidden="true">
                  <span>Method</span>
                  <span>Location</span>
                  <span>Price</span>
                  <span>Delivery estimate</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                <ul
                  className="shipping-method-list"
                  aria-label="Shipping methods"
                >
                  {otherZones.map((zone) => (
                    <li className="shipping-method-row" key={zone.code}>
                      <div className="shipping-method-name">
                        <strong>{zone.service_label}</strong>
                        {zone.description && <p>{zone.description}</p>}
                      </div>
                      <div className="shipping-method-location">
                        <span className="shipping-mobile-label">Location</span>
                        <span>
                          {settings.states[zone.state_code] ?? zone.state_code}
                        </span>
                        {zone.locality_code && (
                          <small>
                            {zone.locality_code.replaceAll("_", " ")}
                          </small>
                        )}
                      </div>
                      <div className="shipping-method-price">
                        <span className="shipping-mobile-label">Price</span>
                        <strong>
                          <Price value={zone.amount_minor} />
                        </strong>
                      </div>
                      <div className="shipping-method-estimate">
                        <span className="shipping-mobile-label">
                          Delivery estimate
                        </span>
                        {zone.estimate || "—"}
                      </div>
                      <div className="shipping-method-status">
                        <span className="shipping-mobile-label">Status</span>
                        <StatusBadge
                          value={zone.active ? "active" : "inactive"}
                        />
                      </div>
                      <div className="shipping-method-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={(event) => edit(zone, event.currentTarget)}
                          disabled={busy}
                        >
                          Edit
                        </Button>
                        <ActionMenu
                          label={`More actions for ${zone.service_label}`}
                          compact
                        >
                          {zone.active ? (
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={(event) =>
                                openConfirm(
                                  zone,
                                  "deactivate",
                                  event.currentTarget,
                                )
                              }
                              disabled={busy}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="quiet"
                              onClick={() => void activate(zone.code)}
                              disabled={busy}
                            >
                              Activate
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="danger"
                            onClick={(event) =>
                              openConfirm(zone, "archive", event.currentTarget)
                            }
                            disabled={busy}
                          >
                            Archive
                          </Button>
                        </ActionMenu>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {confirm && (
              <ShippingActionDialog
                zone={confirm.zone}
                action={confirm.action}
                stateName={
                  settings.states[confirm.zone.state_code] ??
                  confirm.zone.state_code
                }
                busy={busy}
                error={confirmationError || error}
                returnFocusTo={confirm.trigger}
                onClose={() => {
                  if (!busy) setConfirm(null);
                }}
                onConfirm={() => void confirmedChange()}
              />
            )}
            {editing && (
              <Modal
                open
                title={
                  areaMode
                    ? editing === "new"
                      ? "Add Abuja delivery area"
                      : "Edit Abuja delivery area"
                    : editing === "new"
                      ? "Add shipping method"
                      : "Edit shipping method"
                }
                className="shipping-method-modal"
                initialFocus="input"
                returnFocusTo={editReturnFocus}
                lockScroll
                onClose={() => {
                  if (!busy) setEditing(null);
                }}
              >
                <form
                  className="commerce-editor"
                  onSubmit={(event) => void save(event)}
                >
                  {error && <Alert tone="error">{error}</Alert>}
                  {fieldError && (
                    <div id="shipping-settings-error">
                      <Alert tone="error">{fieldError}</Alert>
                    </div>
                  )}
                  <label>
                    {areaMode ? "Area name" : "Method name"}
                    <Input
                      value={name}
                      placeholder={
                        areaMode
                          ? "e.g. Wuse"
                          : "e.g. Standard Delivery or Express Delivery"
                      }
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={160}
                      aria-invalid={
                        errorField === (areaMode ? "area" : "name") || undefined
                      }
                      aria-describedby={
                        errorField === (areaMode ? "area" : "name")
                          ? "shipping-settings-error"
                          : undefined
                      }
                    />
                  </label>
                  {areaMode ? (
                    <p className="shipping-area-state">
                      State: Federal Capital Territory
                    </p>
                  ) : (
                    <label>
                      State
                      <Select
                        value={state}
                        onChange={(event) => {
                          setState(event.target.value);
                          setLocality("");
                        }}
                        required
                        aria-invalid={errorField === "state" || undefined}
                        aria-describedby={
                          errorField === "state"
                            ? "shipping-settings-error"
                            : undefined
                        }
                      >
                        <option value="">Choose a state</option>
                        {Object.entries(settings.states).map(
                          ([code, label]) => (
                            <option key={code} value={code}>
                              {label}
                            </option>
                          ),
                        )}
                      </Select>
                    </label>
                  )}
                  {!areaMode && (
                    <label>
                      Delivery area (optional)
                      <Input
                        value={locality}
                        onChange={(event) => setLocality(event.target.value)}
                        placeholder="Leave blank for State-wide delivery"
                        maxLength={120}
                        aria-invalid={errorField === "area" || undefined}
                        aria-describedby={
                          errorField === "area"
                            ? "shipping-settings-error"
                            : undefined
                        }
                      />
                    </label>
                  )}
                  <label>
                    {areaMode ? "Delivery price (₦)" : "Price (₦)"}
                    <Input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      required
                      aria-invalid={errorField === "price" || undefined}
                      aria-describedby={
                        errorField === "price"
                          ? "shipping-settings-error"
                          : undefined
                      }
                    />
                  </label>
                  <label>
                    Description (optional)
                    <Input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={240}
                    />
                  </label>
                  <label>
                    Delivery estimate (optional)
                    <Input
                      value={estimate}
                      onChange={(event) => setEstimate(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className="commerce-checkbox">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(event) => setActive(event.target.checked)}
                    />{" "}
                    Active
                  </label>
                  {!settings.current && (
                    <label className="commerce-checkbox">
                      <input
                        type="checkbox"
                        checked={developmentOnly}
                        onChange={(event) =>
                          setDevelopmentOnly(event.target.checked)
                        }
                      />{" "}
                      Restrict this configuration to preview environments
                    </label>
                  )}
                  <div className="commerce-form-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditing(null)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      loading={busy}
                      loadingLabel={
                        areaMode ? "Saving area…" : "Saving method…"
                      }
                    >
                      {areaMode
                        ? editing === "new"
                          ? "Add area"
                          : "Save area"
                        : "Publish method"}
                    </Button>
                  </div>
                </form>
              </Modal>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
export function TaxSettings() {
  return (
    <Access>
      <TaxEditor />
    </Access>
  );
}
function TaxEditor() {
  const {
    settings,
    payload,
    setPayload,
    error,
    notice,
    busy,
    publish,
    developmentOnly,
    setDevelopmentOnly,
  } = useSettings();
  const [fieldError, setFieldError] = useState("");
  const [deliveryLabelDraft, setDeliveryLabelDraft] = useState<string | null>(
    null,
  );
  const [rules, setRules] = useState<
    | {
        category: string;
        label: string;
        percent: string;
        labelTouched?: boolean;
      }[]
    | null
  >(null);
  const shownRules =
    rules ??
    payload.product_rules.map((rule) => ({
      category: rule.category,
      label: displayTaxLabel(rule.label, rule.category),
      percent: percentage(rule.rate),
      labelTouched: false,
    }));
  const taxEnabled = payload.tax_enabled ?? true;
  const defaultCode =
    payload.default_tax_category ?? shownRules[0]?.category ?? "";
  const defaultIndex = Math.max(
    0,
    shownRules.findIndex((rule) => rule.category === defaultCode),
  );
  const [deliveryPercent, setDeliveryPercent] = useState<string | null>(null);
  const shownDeliveryPercent =
    deliveryPercent ??
    (payload.delivery_tax.rate ? percentage(payload.delivery_tax.rate) : "");
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      if (taxEnabled && shownRules.length === 0)
        throw new Error("Enter a default tax rate before enabling tax.");
      const next: Payload = {
        ...payload,
        tax_enabled: taxEnabled,
        default_tax_category: taxEnabled
          ? defaultCode
          : payload.default_tax_category,
        product_rules: (taxEnabled
          ? shownRules
          : payload.product_rules.map((rule) => ({
              category: rule.category,
              label: rule.label,
              percent: percentage(rule.rate),
              labelTouched: false,
            }))
        ).map((rule, index) => ({
          category: rule.category.trim(),
          label:
            !rule.labelTouched &&
            payload.product_rules[index]?.category === rule.category.trim() &&
            rule.label ===
              displayTaxLabel(
                payload.product_rules[index].label,
                payload.product_rules[index].category,
              )
              ? payload.product_rules[index].label
              : rule.label.trim(),
          rate: fraction(rule.percent),
        })),
        delivery_tax: {
          ...payload.delivery_tax,
          label: payload.delivery_tax.taxable
            ? (deliveryLabelDraft?.trim() ?? payload.delivery_tax.label)
            : deliveryLabelDraft?.trim() ||
              payload.delivery_tax.label ||
              "Not taxable",
          rate: payload.delivery_tax.taxable
            ? fraction(shownDeliveryPercent)
            : null,
        },
      };
      if (!next.product_rules.every((rule) => rule.category && rule.label))
        throw new Error("Each tax treatment needs a code and label.");
      if (await publish(next)) {
        setRules(null);
        setDeliveryPercent(null);
        setDeliveryLabelDraft(null);
      }
      setFieldError("");
    } catch (failure) {
      setFieldError(
        failure instanceof Error ? failure.message : "Check tax settings.",
      );
    }
  }
  return (
    <AdminShell
      title="Tax"
      description="Choose whether tax applies to new orders."
      parent={{ label: "Commerce settings", href: "/admin/settings" }}
    >
      <div className="commerce-settings-body">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <p role="status">{notice}</p>}
        {!settings ? (
          <p role="status">Loading tax settings…</p>
        ) : (
          <form
            className="commerce-editor tax-editor"
            onSubmit={(event) => void save(event)}
          >
            <div className="tax-editor-intro">
              <p>
                Changes apply to new checkout quotes. Existing orders are
                unchanged.
              </p>
              <Alert tone="info">
                Confirm tax settings with your accountant or tax adviser. No
                legal rate is supplied by this application.
              </Alert>
            </div>
            {fieldError && (
              <div id="tax-settings-error">
                <Alert tone="error">{fieldError}</Alert>
              </div>
            )}
            <section
              className="tax-editor-section"
              aria-labelledby="product-tax-heading"
            >
              <div className="tax-editor-section-heading">
                <h2 id="product-tax-heading">Product tax</h2>
                <p>Set the default treatment for products at checkout.</p>
              </div>
              <label className="tax-editor-switch">
                <span className="tax-editor-switch-copy">
                  <strong>Apply tax at checkout</strong>
                  <span aria-hidden="true">{taxEnabled ? "On" : "Off"}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Apply tax at checkout"
                  checked={taxEnabled}
                  onChange={(event) => {
                    setPayload((old) => ({
                      ...old,
                      tax_enabled: event.target.checked,
                    }));
                    if (event.target.checked && shownRules.length === 0) {
                      setRules([
                        {
                          category: "STANDARD",
                          label: "Standard",
                          percent: "",
                          labelTouched: true,
                        },
                      ]);
                      setPayload((old) => ({
                        ...old,
                        tax_enabled: true,
                        default_tax_category: "STANDARD",
                      }));
                    }
                    setFieldError("");
                  }}
                />
                <span className="tax-editor-switch-track" aria-hidden="true">
                  <span className="tax-editor-switch-thumb" />
                </span>
              </label>
              {!taxEnabled && (
                <p className="tax-editor-help">
                  {settings.current &&
                  (settings.current.payload.tax_enabled ?? true)
                    ? "Save these settings to stop applying tax to new orders."
                    : "Tax is currently not applied to orders."}
                </p>
              )}
              {taxEnabled && (
                <>
                  <div className="tax-editor-fields">
                    <label>
                      Default rate (%)
                      <Input
                        value={shownRules[defaultIndex]?.percent ?? ""}
                        onChange={(event) =>
                          setRules(
                            shownRules.map((rule, index) =>
                              index === defaultIndex
                                ? { ...rule, percent: event.target.value }
                                : rule,
                            ),
                          )
                        }
                        inputMode="decimal"
                        required
                        aria-invalid={!!fieldError || undefined}
                        aria-describedby={
                          fieldError ? "tax-settings-error" : undefined
                        }
                      />
                    </label>
                    <label>
                      Default treatment
                      <Select
                        value={defaultCode}
                        onChange={(event) =>
                          setPayload((old) => ({
                            ...old,
                            default_tax_category: event.target.value,
                          }))
                        }
                      >
                        {shownRules
                          .filter((rule) => rule.category)
                          .map((rule) => (
                            <option key={rule.category} value={rule.category}>
                              {rule.label || rule.category}
                            </option>
                          ))}
                      </Select>
                    </label>
                  </div>
                  <p className="tax-editor-help">
                    Products without a specific treatment use this store-wide
                    default.
                  </p>
                  <details className="tax-editor-advanced">
                    <summary>Advanced: manage tax treatments</summary>
                    <div className="tax-editor-advanced-content">
                      <h3>Product tax treatments</h3>
                      {shownRules.map((rule, index) => (
                        <div className="commerce-rule" key={index}>
                          <label>
                            Code
                            <Input
                              value={rule.category}
                              onChange={(event) =>
                                setRules(
                                  shownRules.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          category:
                                            event.target.value.toUpperCase(),
                                        }
                                      : item,
                                  ),
                                )
                              }
                              required
                            />
                          </label>
                          <label>
                            Label
                            <Input
                              value={rule.label}
                              onChange={(event) =>
                                setRules(
                                  shownRules.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          label: event.target.value,
                                          labelTouched: true,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              required
                            />
                          </label>
                          <label>
                            Rate (%)
                            <Input
                              value={rule.percent}
                              onChange={(event) =>
                                setRules(
                                  shownRules.map((item, i) =>
                                    i === index
                                      ? { ...item, percent: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              inputMode="decimal"
                              required
                              aria-invalid={!!fieldError || undefined}
                              aria-describedby={
                                fieldError ? "tax-settings-error" : undefined
                              }
                            />
                          </label>
                          <Button
                            type="button"
                            variant="quiet"
                            onClick={() =>
                              setRules(shownRules.filter((_, i) => i !== index))
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setRules([
                            ...shownRules,
                            {
                              category: "",
                              label: "",
                              percent: "",
                              labelTouched: true,
                            },
                          ])
                        }
                      >
                        Add treatment
                      </Button>
                    </div>
                  </details>
                </>
              )}
            </section>
            {taxEnabled && (
              <section
                className="tax-editor-section"
                aria-labelledby="delivery-tax-heading"
              >
                <div className="tax-editor-section-heading">
                  <h2 id="delivery-tax-heading">Delivery tax</h2>
                  <p>Choose how tax applies to delivery charges.</p>
                </div>
                <label className="commerce-checkbox tax-editor-toggle">
                  <input
                    type="checkbox"
                    checked={payload.delivery_tax.taxable}
                    onChange={(event) =>
                      setPayload((old) => ({
                        ...old,
                        delivery_tax: {
                          ...old.delivery_tax,
                          taxable: event.target.checked,
                          rate: event.target.checked
                            ? old.delivery_tax.rate
                            : null,
                        },
                      }))
                    }
                  />{" "}
                  Taxable delivery
                </label>
                <div className="tax-editor-fields">
                  {payload.delivery_tax.taxable && (
                    <label>
                      Delivery tax rate (%)
                      <Input
                        value={shownDeliveryPercent}
                        onChange={(event) =>
                          setDeliveryPercent(event.target.value)
                        }
                        inputMode="decimal"
                        required
                        aria-invalid={!!fieldError || undefined}
                        aria-describedby={
                          fieldError ? "tax-settings-error" : undefined
                        }
                      />
                    </label>
                  )}
                  {payload.delivery_tax.taxable && (
                    <label>
                      Delivery tax treatment label
                      <Input
                        value={
                          deliveryLabelDraft ??
                          displayTaxLabel(payload.delivery_tax.label)
                        }
                        onChange={(event) =>
                          setDeliveryLabelDraft(event.target.value)
                        }
                        required
                      />
                    </label>
                  )}
                </div>
              </section>
            )}
            {!settings.current && (
              <label className="commerce-checkbox tax-editor-preview">
                <input
                  type="checkbox"
                  checked={developmentOnly}
                  onChange={(event) => setDevelopmentOnly(event.target.checked)}
                />{" "}
                Restrict this configuration to preview environments
              </label>
            )}
            <div className="tax-editor-footer">
              <p>
                Saving applies these settings to new checkouts. Existing orders
                keep their original totals.
              </p>
              <Button type="submit" loading={busy}>
                Save tax settings
              </Button>
            </div>
          </form>
        )}
      </div>
    </AdminShell>
  );
}
