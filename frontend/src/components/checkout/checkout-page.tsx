"use client";
import Link from "next/link";
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
  const { cart, refresh: refreshCart } = useCart();
  const scope = user?.id ?? "guest";
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
  const load = useCallback(async () => {
    if (authLoading) return;
    const request = ++sequence.current;
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
      apply(current);
      setDestinations(places);
      setSaved(addresses);
      setError("");
    } catch (e) {
      if (request === sequence.current)
        setError(e instanceof Error ? e.message : "Unable to load checkout.");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [authLoading, user, apply]);
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
    const encoded = JSON.stringify(body);
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
        /* Retry still works in memory when browser storage is unavailable. */
      }
    }
    try {
      const c = await checkoutRequest<Checkout>(
        path ?? "/checkout/" + shown?.id + "/" + kind,
        method,
        body,
        intent.current.key,
      );
      if (request !== sequence.current) return;
      apply(c);
      if (kind === "begin") {
        try {
          sessionStorage.removeItem("iranti-checkout-begin");
        } catch {
          /* Optional retry metadata only. */
        }
      }
      intent.current = null;
      setNotice(
        kind === "reserve"
          ? "Your items are reserved. Payment is not available yet."
          : "Checkout updated.",
      );
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
        <div role="status" aria-live="polite">
          {loading ? "Loading checkout…" : notice}
        </div>
        <div
          ref={errorRef}
          tabIndex={-1}
          id="checkout-errors"
          role={error ? "alert" : undefined}
        >
          {error && (
            <>
              <p>{error}</p>
              <Button disabled={busy} onClick={() => void load()}>
                Refresh checkout
              </Button>
            </>
          )}
        </div>
        {!loading && !shown && (
          <section>
            <h2>Begin checkout</h2>
            <p>
              Your cart stays intact. Stock is held only after you review and
              confirm a complete quote.
            </p>
            <Button
              disabled={
                busy || !cart || cart.items.length === 0 || cart.needs_review
              }
              onClick={() =>
                void action(
                  "begin",
                  { expected_version: cart?.version },
                  "/checkout",
                )
              }
            >
              Continue with your cart
            </Button>
            <p>
              <Link href="/cart">Review cart</Link>
            </p>
          </section>
        )}
        {shown && (
          <>
            <p className="checkout-status" role="status">
              {shown.ownership === "guest"
                ? "Guest checkout"
                : "Account checkout"}{" "}
              · {shown.status.replaceAll("_", " ")}
            </p>
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
              <section className="checkout-notice">
                <h2>
                  {shown.status === "EXPIRED"
                    ? "Your checkout expired"
                    : shown.status === "CANCELLED"
                      ? "Checkout cancelled"
                      : "Your selection needs another review"}
                </h2>
                <p>
                  Your cart has been kept. Any active hold for this attempt has
                  been released. Review your cart before starting again.
                </p>
                <Link href="/cart">Review cart</Link>
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
            <div className="checkout-layout">
              <div>
                {!terminal && shown.status !== "RESERVED" && (
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
                    <label className="checkout-field" htmlFor="checkout-email">
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
                <section>
                  <h2>Your items</h2>
                  <ul className="checkout-lines">
                    {shown.lines.map((l) => (
                      <li key={l.id}>
                        <h3>{l.snapshot.name}</h3>
                        <p>
                          {l.snapshot.options.join(" · ")} · Quantity{" "}
                          {l.quantity}
                        </p>
                        <p>
                          Each <Price value={l.unit_price_minor} /> · Items{" "}
                          <Price value={l.line_subtotal_minor} />
                        </p>
                        {l.tax && (
                          <p>
                            Line tax <Price value={l.tax.tax_minor} />
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <aside
                className="checkout-summary"
                aria-labelledby="checkout-summary-heading"
              >
                <h2 id="checkout-summary-heading">Your total</h2>
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
                    Save your delivery changes and calculate a new total before
                    confirming.
                  </p>
                )}
                {shown.status === "DRAFT" && (
                  <Button
                    disabled={busy || !shown.contact || deliveryDirty}
                    onClick={() =>
                      void action("validate", {
                        expected_version: shown.version,
                      })
                    }
                  >
                    Calculate and review total
                  </Button>
                )}
                {shown.status === "QUOTED" && (
                  <>
                    <p>
                      Review the delivery charge, tax and total. Stock is not
                      reserved yet.
                    </p>
                    <Button
                      disabled={busy || deliveryDirty}
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
                {shown.status === "RESERVED" && (
                  <PlaceOrder
                    key={shown.id}
                    checkout={shown}
                    onCreated={(id) => apply({ ...shown, order_id: id })}
                  />
                )}
                {!terminal && !shown.order_id && (
                  <>
                    <p>
                      Changes in price, availability or configuration require
                      another review.
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
              </aside>
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
