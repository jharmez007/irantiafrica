"use client";
import Link from "next/link";
import { PageSkeleton } from "@/components/loading";
import { ProductImage } from "@/components/catalog/product-image";
import { Logo } from "@/components/brand/logo";
import { PlaceOrder } from "@/components/orders/place-order";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button, Container, Input, Price } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { useCart } from "@/components/cart/cart-provider";
import { toast } from "@/lib/toast";
import {
  CheckoutError,
  checkoutRequest,
  type Checkout,
  type Address,
  type Destinations,
  type SavedAddress,
} from "@/lib/checkout-api";
const blank: Address = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state_code: "",
  postal_code: "",
  country_code: "NG",
  locality_code: null,
};
const labels: Partial<Record<keyof Address, string>> = {
  recipient_name: "Recipient name",
  phone: "Phone number",
  line1: "Street address",
  line2: "Address line 2 (optional)",
  city: "City or town",
  postal_code: "Postal code (optional)",
};
export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, error: cartError, refresh: refreshCart } = useCart();
  const scope = user?.id ?? "guest";
  const cartVersion = cart?.version;
  const cartItemCount = cart?.items.length ?? 0;
  const cartNeedsReview = cart?.needs_review ?? false;
  const sequence = useRef(0);
  const busyLock = useRef(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [destinations, setDestinations] = useState<Destinations>({
    states: {},
    areas: [],
  });
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<Address>(blank);
  const [selection, setSelection] = useState("");
  const [save, setSave] = useState(false);
  const [snapshotScope, setSnapshotScope] = useState("");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const intent = useRef<{ kind: string; body: string; key: string } | null>(
    null,
  );
  const shown = snapshotScope === scope ? checkout : null;
  const confirmed = useRef<{
    scope: string;
    id: string | null;
    contact: string;
  } | null>(null);
  const apply = useCallback(
    (c: Checkout | null) => {
      setCheckout(c);
      setSnapshotScope(scope);
      const previous = confirmed.current;
      const contact = JSON.stringify(c?.contact ?? null);
      if (
        previous?.scope !== scope ||
        previous?.id !== (c?.id ?? null) ||
        previous?.contact !== contact
      ) {
        setEmail(c?.contact?.email ?? user?.email ?? "");
        setAddress(c?.contact?.address ?? blank);
      }
      if (previous?.scope !== scope || previous?.id !== (c?.id ?? null)) {
        setSelection("");
        setSave(false);
      }
      confirmed.current = { scope, id: c?.id ?? null, contact };
    },
    [scope, user?.email],
  );
  const keyFor = useCallback(
    (kind: string, encoded: string) => {
      if (
        !intent.current ||
        intent.current.kind !== kind ||
        intent.current.body !== encoded
      )
        intent.current = { kind, body: encoded, key: crypto.randomUUID() };
      if (kind === "begin") {
        try {
          const stored = JSON.parse(
            sessionStorage.getItem("iranti-checkout-begin") ?? "null",
          );
          if (
            stored?.scope === scope &&
            stored?.body === encoded &&
            typeof stored.key === "string"
          )
            intent.current.key = stored.key;
          sessionStorage.setItem(
            "iranti-checkout-begin",
            JSON.stringify({ scope, body: encoded, key: intent.current.key }),
          );
        } catch {
          /* In-page retries retain the same key if storage is unavailable. */
        }
      }
      return intent.current.key;
    },
    [scope],
  );
  const clearBeginIntent = useCallback(() => {
    if (intent.current?.kind === "begin") intent.current = null;
    try {
      sessionStorage.removeItem("iranti-checkout-begin");
    } catch {
      /* Optional retry metadata only. */
    }
  }, []);
  const load = useCallback(async () => {
    if (authLoading) return;
    const request = ++sequence.current;
    let waitingForCart = false;
    setLoading(true);
    try {
      const [current, places, addresses] = await Promise.all([
        checkoutRequest<Checkout | null>("/checkout/current"),
        checkoutRequest<Destinations>("/checkout/destinations"),
        user
          ? checkoutRequest<SavedAddress[]>("/addresses")
          : Promise.resolve([]),
      ]);
      if (request !== sequence.current) return;
      setDestinations(places);
      setSaved(addresses);
      if (current) {
        apply(current);
        clearBeginIntent();
        setError("");
        return;
      }
      apply(null);
      if (cartVersion === undefined) {
        waitingForCart = !cartError;
        setError(cartError);
        return;
      }
      if (cartItemCount === 0 || cartNeedsReview) {
        setError("");
        return;
      }
      const body = { expected_version: cartVersion };
      const created = await checkoutRequest<Checkout>(
        "/checkout",
        "POST",
        body,
        keyFor("begin", JSON.stringify(body)),
      );
      if (request !== sequence.current) return;
      apply(created);
      clearBeginIntent();
      setError("");
    } catch (e) {
      if (request !== sequence.current) return;
      let recovered = false;
      if (e instanceof CheckoutError && e.details.checkout) {
        apply(e.details.checkout);
        clearBeginIntent();
        setError("");
        recovered = true;
      } else if (e instanceof CheckoutError && e.details.checkout_id) {
        try {
          const resumed = await checkoutRequest<Checkout>(
            "/checkout/" + e.details.checkout_id,
          );
          if (request === sequence.current) {
            apply(resumed);
            clearBeginIntent();
            setError("");
            recovered = true;
          }
        } catch {
          if (request === sequence.current) setError(e.message);
        }
      } else {
        setError(
          e instanceof CheckoutError
            ? [e.message, ...Object.values(e.fields).flat()].join(" ")
            : e instanceof Error
              ? e.message
              : "Unable to prepare checkout. Retry safely.",
        );
      }
      if (!recovered) errorRef.current?.focus();
    } finally {
      if (request === sequence.current) setLoading(waitingForCart);
    }
  }, [
    authLoading,
    user,
    apply,
    cartVersion,
    cartItemCount,
    cartNeedsReview,
    cartError,
    keyFor,
    clearBeginIntent,
  ]);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void load();
    });
    return () => {
      mounted = false;
      invalidate();
    };
  }, [load, invalidate]);
  useEffect(() => {
    if (
      !shown ||
      shown.order_id ||
      !["DRAFT", "QUOTED", "RESERVED"].includes(shown.status)
    )
      return;
    const id = shown.id;
    const timer = setInterval(() => {
      if (busyLock.current) return;
      const request = ++sequence.current;
      void checkoutRequest<Checkout>("/checkout/" + id)
        .then((c) => {
          if (request === sequence.current) apply(c);
        })
        .catch(() => {
          if (request === sequence.current)
            setError(
              "Unable to confirm reservation status. Retry before continuing.",
            );
        });
    }, 30000);
    return () => clearInterval(timer);
  }, [shown, apply]);
  async function action(
    kind: string,
    body: Record<string, unknown> = {},
    path?: string,
    method = "POST",
  ) {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const request = ++sequence.current;
    const key = keyFor(kind, JSON.stringify(body));
    try {
      const c = await checkoutRequest<Checkout>(
        path ?? "/checkout/" + shown?.id + "/" + kind,
        method,
        body,
        key,
      );
      if (request !== sequence.current) return;
      apply(c);
      if (kind === "begin") clearBeginIntent();
      else intent.current = null;
      if (kind === "begin") {
        setSummaryExpanded(false);
        setMobileSummaryOpen(false);
      }
      if (kind === "reserve")
        setNotice("Your items are reserved. Payment is not available yet.");
      else toast.success("Checkout updated");
      heading.current?.focus();
      void refreshCart();
    } catch (e) {
      if (request !== sequence.current) return;
      setError(
        e instanceof CheckoutError
          ? [e.message, ...Object.values(e.fields).flat()].join(" ")
          : "Checkout could not be updated. Retry safely.",
      );
      if (e instanceof CheckoutError && e.details.checkout)
        apply(e.details.checkout);
      if (e instanceof CheckoutError && e.details.checkout_id) {
        try {
          const recovered = await checkoutRequest<Checkout>(
            "/checkout/" + e.details.checkout_id,
          );
          if (request === sequence.current) apply(recovered);
        } catch {
          /* Keep the original safe error. */
        }
      }
      errorRef.current?.focus();
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!shown || busyLock.current) return;
    if (save && user && !selection) {
      busyLock.current = true;
      setBusy(true);
      try {
        const a = await checkoutRequest<SavedAddress>(
          "/addresses",
          "POST",
          address,
        );
        setSaved((old) => [...old, a]);
        setSelection(a.id);
        setSave(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to save address.");
        errorRef.current?.focus();
        return;
      } finally {
        busyLock.current = false;
        setBusy(false);
      }
    }
    await action(
      "address",
      {
        expected_version: shown.version,
        email,
        ...(selection ? { saved_address_id: selection } : { address }),
      },
      "/checkout/" + shown.id + "/address",
      "PATCH",
    );
  }
  const terminal =
    shown && ["REVIEW_REQUIRED", "EXPIRED", "CANCELLED"].includes(shown.status);
  const deliveryDirty =
    !!shown?.contact &&
    (email.trim().toLowerCase() !== shown.contact.email ||
      Object.keys(blank).some(
        (key) =>
          String(address[key as keyof Address] ?? "") !==
          String(shown.contact!.address[key as keyof Address] ?? ""),
      ));
  const areas = destinations.areas.filter(
    (a) => a.state_code === address.state_code && a.locality_code !== null,
  );
  const itemCount =
    shown?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;
  return (
    <main id="main-content" className="checkout-main">
      <Container>
        <p className="eyebrow">Your selection, reviewed</p>
        <h1 ref={heading} tabIndex={-1}>
          Checkout
        </h1>
        <p>
          Delivery within Nigeria. All prices and totals are confirmed by the
          store in NGN.
        </p>
        {!loading && (
          <div role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {loading && (
          <PageSkeleton
            kind="checkout"
            label="Loading checkout"
            showHeading={false}
          />
        )}
        <div
          ref={errorRef}
          tabIndex={-1}
          id="checkout-errors"
          role={error ? "alert" : undefined}
          className={error ? "checkout-error" : undefined}
        >
          {error && (
            <>
              <p>{error}</p>
              <Button disabled={busy} onClick={() => void load()}>
                Retry checkout
              </Button>
              {!shown && <Link href="/cart">Return to cart</Link>}
            </>
          )}
        </div>
        {!loading && !shown && !error && (
          <section className="checkout-notice">
            <h2>
              {cartNeedsReview ? "Review your cart" : "Your cart is empty"}
            </h2>
            <p>
              {cartNeedsReview
                ? "Resolve the items needing attention before checkout can continue."
                : "Add something from the collection before checking out."}
            </p>
            <Link href="/cart">Return to cart</Link>
          </section>
        )}
        {shown && (
          <>
            {!terminal && (
              <p className="checkout-status" role="status">
                {shown.order_id
                  ? "Your order is ready for payment"
                  : terminal
                    ? "Your selection needs attention"
                    : shown.status === "DRAFT"
                      ? "Contact and delivery"
                      : shown.status === "QUOTED"
                        ? "Review your total"
                        : "Your items are reserved"}
              </p>
            )}
            {shown.order_id && (
              <section className="checkout-notice">
                <p>
                  This checkout has become an order. Start another checkout only
                  for a separate purchase.
                </p>
                <Button
                  disabled={
                    busy || !cart || cart.needs_review || !cart.items.length
                  }
                  onClick={() => {
                    intent.current = null;
                    void action(
                      "begin",
                      { expected_version: cart?.version },
                      "/checkout",
                    );
                  }}
                >
                  Start a new checkout
                </Button>
              </section>
            )}
            {terminal && (
              <section
                className="checkout-recovery"
                aria-labelledby="checkout-recovery-heading"
              >
                <Logo
                  variant="mark"
                  linked={false}
                  className="checkout-recovery-mark"
                />
                <p className="eyebrow">Your selection is saved</p>
                <h2 id="checkout-recovery-heading" tabIndex={-1}>
                  {shown.status === "EXPIRED"
                    ? "Your cart is ready when you are"
                    : shown.status === "CANCELLED"
                      ? "Checkout stopped"
                      : "Your cart needs a quick review"}
                </h2>
                <p>
                  {shown.status === "REVIEW_REQUIRED"
                    ? "Something in your cart changed while checkout was being prepared. Your cart is still saved — review it before continuing."
                    : "Your cart is still saved. Review it before continuing, or try checkout again."}
                </p>
                <div className="checkout-recovery-actions">
                  <Link className="button button--primary" href="/cart">
                    Review my cart
                  </Link>
                  <Button
                    variant="secondary"
                    disabled={
                      busy || !cart || cart.needs_review || !cart.items.length
                    }
                    onClick={() => {
                      intent.current = null;
                      void action(
                        "begin",
                        { expected_version: cart?.version },
                        "/checkout",
                      );
                    }}
                  >
                    Try checkout again
                  </Button>
                </div>
                {cartNeedsReview && (
                  <p>
                    Resolve the marked items in your cart before trying again.
                  </p>
                )}
                <p className="checkout-recovery-detail">
                  Any temporary stock reservation from this checkout has been
                  released.
                </p>
              </section>
            )}
            {!terminal && (
              <div className="checkout-layout">
                <div>
                  {shown.status !== "RESERVED" && (
                    <form
                      method="post"
                      onSubmit={(event) => void submit(event)}
                      noValidate
                      aria-describedby="checkout-errors"
                    >
                      <h2>Contact and delivery</h2>
                      {user && saved.length > 0 && (
                        <label className="checkout-field">
                          Saved address
                          <select
                            value={selection}
                            onChange={(e) => {
                              setSelection(e.target.value);
                              const a = saved.find(
                                (a) => a.id === e.target.value,
                              );
                              if (a) {
                                const { id: ignored, ...rest } = a;
                                void ignored;
                                setAddress(rest);
                              } else setAddress(blank);
                            }}
                          >
                            <option value="">Enter a new address</option>
                            {saved.map((a) => (
                              <option value={a.id} key={a.id}>
                                {a.recipient_name} — {a.line1}, {a.city}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label
                        className="checkout-field"
                        htmlFor="checkout-email"
                      >
                        Contact email
                        <Input
                          id="checkout-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          aria-describedby="checkout-errors"
                          required
                          disabled={busy}
                        />
                      </label>
                      <fieldset disabled={busy || !!selection}>
                        <legend>Delivery address</legend>
                        <div className="checkout-fields">
                          {Object.entries(labels).map(([key, label]) => (
                            <label
                              className="checkout-field"
                              key={key}
                              htmlFor={"checkout-" + key}
                            >
                              {label}
                              <Input
                                id={"checkout-" + key}
                                value={address[key as keyof Address] ?? ""}
                                type={key === "phone" ? "tel" : "text"}
                                autoComplete={
                                  key === "phone"
                                    ? "tel"
                                    : key === "recipient_name"
                                      ? "shipping name"
                                      : key === "line1"
                                        ? "shipping address-line1"
                                        : key === "line2"
                                          ? "shipping address-line2"
                                          : key === "city"
                                            ? "shipping address-level2"
                                            : "shipping postal-code"
                                }
                                aria-describedby="checkout-errors"
                                onChange={(e) =>
                                  setAddress({
                                    ...address,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            </label>
                          ))}
                          <label
                            className="checkout-field"
                            htmlFor="checkout-state"
                          >
                            State / FCT
                            <select
                              id="checkout-state"
                              value={address.state_code}
                              aria-describedby="checkout-errors"
                              onChange={(e) =>
                                setAddress({
                                  ...address,
                                  state_code: e.target.value,
                                  locality_code: null,
                                })
                              }
                            >
                              <option value="">Choose a state or FCT</option>
                              {Object.entries(destinations.states).map(
                                ([code, name]) => (
                                  <option key={code} value={code}>
                                    {name}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          {areas.length > 0 && (
                            <label
                              className="checkout-field"
                              htmlFor="checkout-area"
                            >
                              Delivery area
                              <select
                                id="checkout-area"
                                value={address.locality_code ?? ""}
                                aria-describedby="checkout-errors"
                                onChange={(e) =>
                                  setAddress({
                                    ...address,
                                    locality_code: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">
                                  State-wide coverage, if configured
                                </option>
                                {areas.map((a) => (
                                  <option
                                    key={a.locality_code}
                                    value={a.locality_code!}
                                  >
                                    {a.locality_code!.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      </fieldset>
                      {user && !selection && (
                        <label className="checkout-save">
                          <input
                            type="checkbox"
                            checked={save}
                            onChange={(e) => setSave(e.target.checked)}
                          />{" "}
                          Save this address to my account
                        </label>
                      )}
                      <Button disabled={busy}>Save delivery details</Button>
                    </form>
                  )}
                  {shown.contact && (
                    <section>
                      <h2>Delivery details</h2>
                      <p>
                        {shown.contact.email}
                        <br />
                        {shown.contact.address.recipient_name}
                        <br />
                        {shown.contact.address.line1}
                        <br />
                        {shown.contact.address.city},{" "}
                        {shown.contact.address.state_code}
                        <br />
                        {shown.contact.address.phone}
                      </p>
                    </section>
                  )}
                  {shown.calculation?.delivery && (
                    <section className="checkout-delivery-step">
                      <h2>Delivery &amp; review</h2>
                      <p>
                        {shown.calculation.delivery.service_label}. Your
                        delivery charge and taxes are included in the reviewed
                        total.
                      </p>
                    </section>
                  )}
                  {shown.status === "DRAFT" && (
                    <section className="checkout-next-step">
                      <h2>Review your total</h2>
                      <p>
                        Save your delivery details, then calculate the current
                        charges before confirming.
                      </p>
                      <Button
                        disabled={!shown.contact || deliveryDirty}
                        loading={busy}
                        onClick={() =>
                          void action("validate", {
                            expected_version: shown.version,
                          })
                        }
                      >
                        Calculate and review total
                      </Button>
                    </section>
                  )}
                  {shown.status === "RESERVED" && (
                    <section className="checkout-next-step">
                      <h2>Continue to payment</h2>
                      <PlaceOrder
                        key={shown.id}
                        checkout={shown}
                        onCreated={(id) => apply({ ...shown, order_id: id })}
                      />
                    </section>
                  )}
                </div>
                <aside className="checkout-summary" aria-label="Order summary">
                  <div className="checkout-summary-desktop-heading">
                    <div>
                      <h2 id="checkout-summary-heading">Order summary</h2>
                      <p>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <Link href="/cart">Edit cart</Link>
                  </div>
                  <button
                    type="button"
                    className="checkout-summary-mobile-toggle"
                    aria-expanded={mobileSummaryOpen}
                    aria-controls="checkout-summary-content"
                    onClick={() => setMobileSummaryOpen((open) => !open)}
                  >
                    <span>
                      Order summary · {itemCount}{" "}
                      {itemCount === 1 ? "item" : "items"}
                    </span>
                    <strong>
                      {shown.total_minor === null ? "Subtotal" : "Total"}:{" "}
                      <Price
                        value={shown.total_minor ?? shown.subtotal_minor}
                      />
                    </strong>
                    <span aria-hidden="true">⌄</span>
                  </button>
                  <div
                    id="checkout-summary-content"
                    className="checkout-summary-content"
                    data-mobile-open={mobileSummaryOpen}
                  >
                    <Link className="checkout-summary-mobile-edit" href="/cart">
                      Edit cart
                    </Link>
                    <ul
                      className={`checkout-lines ${summaryExpanded ? "checkout-lines--expanded" : ""}`}
                      aria-label="Items in your order"
                      tabIndex={
                        summaryExpanded && shown.lines.length > 5
                          ? 0
                          : undefined
                      }
                    >
                      {shown.lines
                        .slice(0, summaryExpanded ? undefined : 4)
                        .map((line) => (
                          <li key={line.id}>
                            <div className="checkout-line-image">
                              {line.snapshot.image ? (
                                <ProductImage image={line.snapshot.image} />
                              ) : (
                                <span
                                  className="checkout-line-image-fallback"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                            <div className="checkout-line-detail">
                              <h3>{line.snapshot.name}</h3>
                              {line.snapshot.options.length > 0 && (
                                <p>{line.snapshot.options.join(" · ")}</p>
                              )}
                              <p>Quantity {line.quantity}</p>
                              <p>
                                Each <Price value={line.unit_price_minor} />
                              </p>
                            </div>
                            <p className="checkout-line-total">
                              <Price value={line.line_subtotal_minor} />
                            </p>
                          </li>
                        ))}
                    </ul>
                    {shown.lines.length > 4 && (
                      <Button
                        variant="quiet"
                        className="checkout-lines-toggle"
                        aria-expanded={summaryExpanded}
                        onClick={() => setSummaryExpanded((open) => !open)}
                      >
                        {summaryExpanded
                          ? "Show fewer items"
                          : `Show ${shown.lines.length - 4} more ${shown.lines.length - 4 === 1 ? "item" : "items"}`}
                      </Button>
                    )}
                    {shown.calculation?.development_only && (
                      <p role="status">DEVELOPMENT CONFIGURATION ONLY</p>
                    )}
                    <dl>
                      <dt>Items subtotal</dt>
                      <dd>
                        <Price value={shown.subtotal_minor} />
                      </dd>
                      <dt>Delivery</dt>
                      <dd>
                        {shown.delivery_minor === null ? (
                          "Awaiting destination and rate"
                        ) : (
                          <Price value={shown.delivery_minor} />
                        )}
                      </dd>
                      <dt>Product tax</dt>
                      <dd>
                        {shown.calculation ? (
                          <Price value={shown.calculation.product_tax_minor} />
                        ) : (
                          "Awaiting configuration"
                        )}
                      </dd>
                      <dt>Delivery tax</dt>
                      <dd>
                        {shown.calculation ? (
                          <Price value={shown.calculation.delivery_tax_minor} />
                        ) : (
                          "Awaiting configuration"
                        )}
                      </dd>
                      <dt>Tax total</dt>
                      <dd>
                        {shown.tax_minor === null ? (
                          "Not calculated"
                        ) : (
                          <Price value={shown.tax_minor} />
                        )}
                      </dd>
                      <dt>Total (NGN)</dt>
                      <dd>
                        {shown.total_minor === null ? (
                          "Not yet available"
                        ) : (
                          <Price value={shown.total_minor} />
                        )}
                      </dd>
                    </dl>
                    {deliveryDirty && (
                      <p role="status">
                        Save your delivery changes and calculate a new total
                        before confirming.
                      </p>
                    )}
                    {shown.status === "QUOTED" && (
                      <>
                        <p>
                          Review the delivery charge, tax and total. Stock is
                          not reserved yet.
                        </p>
                        <Button
                          disabled={deliveryDirty}
                          loading={busy}
                          onClick={() =>
                            void action("reserve", {
                              expected_version: shown.version,
                              fingerprint: shown.fingerprint,
                            })
                          }
                        >
                          Confirm total and reserve items
                        </Button>
                      </>
                    )}
                    {shown.status === "RESERVED" && !shown.order_id && (
                      <p role="status">
                        Your items are reserved until{" "}
                        <time dateTime={shown.expires_at}>
                          {new Date(shown.expires_at).toLocaleString()}
                        </time>
                        . Payment is not available yet.
                      </p>
                    )}
                    {!terminal && !shown.order_id && (
                      <>
                        <p>
                          Changes in price, availability or configuration
                          require another review.
                        </p>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              "cancel",
                              {},
                              "/checkout/" + shown.id,
                              "DELETE",
                            )
                          }
                        >
                          Cancel checkout
                        </Button>
                      </>
                    )}
                    <p>
                      <Link href="/cart">Back to cart</Link>
                    </p>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </Container>
    </main>
  );
}
