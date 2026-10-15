"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageSkeleton } from "@/components/loading";
import { ProductImage } from "@/components/catalog/product-image";
import { Logo } from "@/components/brand/logo";
import { orderRequest, type OrderRecord } from "@/lib/order-api";
import { continueHostedPayment } from "@/lib/hosted-payment";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Container, Input, Price, Select } from "@/components/ui";
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
  type ShippingMethod,
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
const draftKey = (scope: string, id: string) =>
  `iranti-checkout-address-${scope}-${id}`;
const sameAddress = (left: Address, right: Address) =>
  Object.keys(blank).every(
    (key) =>
      String(left[key as keyof Address] ?? "") ===
      String(right[key as keyof Address] ?? ""),
  );
export function CheckoutPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { cart, error: cartError, refresh: refreshCart } = useCart();
  const scope = user?.id ?? "guest";
  const cartVersion = cart?.version;
  const cartItemCount = cart?.items.length ?? 0;
  const cartNeedsReview = cart?.needs_review ?? false;
  const sequence = useRef(0);
  const busyLock = useRef(false);
  const paymentLock = useRef(false);
  const renderedCheckout = useRef(false);
  const freshStartAttempted = useRef(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [destinations, setDestinations] = useState<Destinations>({
    states: {},
    areas: [],
  });
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodsError, setMethodsError] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [methodRetry, setMethodRetry] = useState(0);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [quoteCycle, setQuoteCycle] = useState(0);
  const [quoteError, setQuoteError] = useState(false);
  const [verifiedCartVersion, setVerifiedCartVersion] = useState<number>();
  const [methodUnavailable, setMethodUnavailable] = useState(false);
  const immediateSelection = useRef(false);
  const [proceeding, setProceeding] = useState<
    "preparing" | "redirecting" | null
  >(null);
  const [paymentError, setPaymentError] = useState("");
  const attemptedQuote = useRef("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<Address>(blank);
  const draftEmail = useRef("");
  const draftAddress = useRef<Address>(blank);
  const [selection, setSelection] = useState("");
  const [save, setSave] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [saveAddressError, setSaveAddressError] = useState(false);
  const [saveAddressRetry, setSaveAddressRetry] = useState(0);
  const saveAddressPending = useRef(false);
  const [snapshotScope, setSnapshotScope] = useState("");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shippingHeading = useRef<HTMLHeadingElement>(null);
  const paymentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const first = Object.keys(fieldErrors)[0]?.replace(/^address\./, "");
    if (!first) return;
    const id =
      first === "state_code"
        ? "checkout-state"
        : first === "locality_code"
          ? "checkout-area"
          : `checkout-${first}`;
    document.getElementById(id)?.focus();
  }, [fieldErrors]);
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
    (c: Checkout | null, preserveDraft = false, forceContact = false) => {
      renderedCheckout.current = !!c;
      setCheckout(c);
      if (c?.ownership === "guest" && c.order_id) {
        try {
          // The ID is only a hint. The scoped HttpOnly order capability and
          // current cart ownership are checked again by the recovery API.
          localStorage.setItem("iranti-guest-recovery-order", c.order_id);
        } catch {
          /* Recovery remains available from the known order URL. */
        }
      }
      setSnapshotScope(scope);
      const previous = confirmed.current;
      const contact = JSON.stringify(c?.contact ?? null);
      if (
        !preserveDraft &&
        (forceContact ||
          previous?.scope !== scope ||
          previous?.id !== (c?.id ?? null) ||
          previous?.contact !== contact)
      ) {
        let nextEmail = c?.contact?.email ?? user?.email ?? "";
        let nextAddress = c?.contact?.address ?? blank;
        if (
          c &&
          ["DRAFT", "QUOTED"].includes(c.status) &&
          (previous?.scope !== scope || previous?.id !== c.id)
        ) {
          try {
            const stored = JSON.parse(
              sessionStorage.getItem(draftKey(scope, c.id)) ?? "null",
            );
            if (
              typeof stored?.email === "string" &&
              stored?.address?.country_code === "NG"
            ) {
              nextEmail = stored.email;
              nextAddress = stored.address;
            }
          } catch {
            /* The server-confirmed address remains available. */
          }
        }
        draftEmail.current = nextEmail;
        draftAddress.current = nextAddress;
        setEmail(nextEmail);
        setAddress(nextAddress);
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
  function persistDraft(nextEmail: string, nextAddress: Address) {
    if (!shown) return;
    try {
      sessionStorage.setItem(
        draftKey(scope, shown.id),
        JSON.stringify({ email: nextEmail, address: nextAddress }),
      );
    } catch {
      /* A blocked storage API must not stop checkout. */
    }
  }
  function updateAddress(next: Address) {
    draftAddress.current = next;
    setSaveAddressError(false);
    latestDraft.current = JSON.stringify({
      email: draftEmail.current,
      address: next,
      selectedMethod,
    });
    setAddress(next);
    persistDraft(draftEmail.current, next);
  }
  function markEmailDraft(nextEmail: string) {
    latestDraft.current = JSON.stringify({
      email: nextEmail,
      address: draftAddress.current,
      selectedMethod,
    });
  }
  function fieldError(key: string) {
    return fieldErrors[`address.${key}`] ?? fieldErrors[key];
  }
  const load = useCallback(async () => {
    if (authLoading) return;
    const enteredFromCart =
      new URLSearchParams(window.location.search).get("from") === "cart";
    const request = ++sequence.current;
    let waitingForCart = false;
    setLoading(!renderedCheckout.current);
    try {
      const [current, places, addresses] = await Promise.all([
        checkoutRequest<Checkout | null>("/checkout/current"),
        checkoutRequest<Destinations>("/checkout/destinations"),
        user
          ? checkoutRequest<SavedAddress[]>("/addresses")
          : Promise.resolve([]),
      ]);
      if (request !== sequence.current) return;
      setVerifiedCartVersion(cartVersion);
      setDestinations(places);
      setSaved(addresses);
      const currentIsFinished =
        current &&
        (current.order_id ||
          ["REVIEW_REQUIRED", "EXPIRED", "CANCELLED"].includes(current.status));
      if (current && !(enteredFromCart && currentIsFinished)) {
        apply(current);
        clearBeginIntent();
        freshStartAttempted.current = false;
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
      if (
        currentIsFinished &&
        enteredFromCart &&
        !freshStartAttempted.current
      ) {
        clearBeginIntent();
        freshStartAttempted.current = true;
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
      freshStartAttempted.current = false;
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
      if (request === sequence.current)
        setLoading(waitingForCart && !renderedCheckout.current);
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
    let active = true;
    if (!address.state_code) {
      queueMicrotask(() => {
        if (active) {
          setMethods([]);
          setSelectedMethod("");
          setMethodsLoading(false);
        }
      });
      return;
    }
    const state = address.state_code;
    const area = address.locality_code ?? "";
    queueMicrotask(() => {
      if (active) {
        setMethodsLoading(true);
        setMethodsError(false);
        setMethods([]);
        setSelectedMethod("");
      }
    });
    const params = new URLSearchParams({ state_code: state });
    if (area) params.set("locality_code", area);
    void checkoutRequest<ShippingMethod[]>(
      "/checkout/shipping-methods?" + params.toString(),
    )
      .then((available) => {
        if (!active) return;
        setMethods(available);
        const existing =
          shown?.contact?.address.state_code === state &&
          (shown.contact.address.locality_code ?? "") === area
            ? shown.shipping_method_code
            : null;
        setSelectedMethod(
          available.find((method) => method.code === existing)?.code ??
            (available.length === 1 ? available[0].code : ""),
        );
      })
      .catch(() => {
        if (active) setMethodsError(true);
      })
      .finally(() => {
        if (active) setMethodsLoading(false);
      });
    return () => {
      active = false;
    };
    // A quoted checkout is reconciled by the saved address and rate code on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address.state_code, address.locality_code, methodRetry, shown?.id]);
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
    quoteAfterAddress = false,
  ) {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setQuoting(kind === "validate");
    setError("");
    setNotice("");
    setFieldErrors({});
    const request = ++sequence.current;
    const key = keyFor(kind, JSON.stringify(body));
    try {
      let c = await checkoutRequest<Checkout>(
        path ?? "/checkout/" + shown?.id + "/" + kind,
        method,
        body,
        key,
      );
      if (request !== sequence.current) return;
      if (kind === "address" && shown) {
        apply(c);
        try {
          sessionStorage.removeItem(draftKey(scope, shown.id));
        } catch {
          /* Saved server state is authoritative. */
        }
      }
      if (quoteAfterAddress && c.status === "DRAFT") {
        setQuoting(true);
        const quoteBody = { expected_version: c.version };
        c = await checkoutRequest<Checkout>(
          "/checkout/" + c.id + "/validate",
          "POST",
          quoteBody,
          keyFor("validate", JSON.stringify(quoteBody)),
        );
        if (request !== sequence.current) return;
      }
      apply(c);
      if (kind === "begin") clearBeginIntent();
      else intent.current = null;
      if (kind === "begin") {
        setMobileSummaryOpen(false);
      }
      if (kind === "reserve")
        setNotice(
          "Your items are reserved. Continue to payment before the reservation expires.",
        );
      else if (kind === "address" && quoteAfterAddress)
        toast.success("Delivery and total ready to review");
      else toast.success("Checkout updated");
      if (kind === "address" || kind === "validate")
        shippingHeading.current?.focus();
      else if (kind === "reserve")
        queueMicrotask(() => paymentHeading.current?.focus());
      else heading.current?.focus();
      void refreshCart();
      return c;
    } catch (e) {
      if (request !== sequence.current) return;
      const hasFieldErrors =
        e instanceof CheckoutError && Object.keys(e.fields).length > 0;
      if (e instanceof CheckoutError)
        setFieldErrors(
          Object.fromEntries(
            Object.entries(e.fields).map(([key, messages]) => [
              key,
              messages.join(" "),
            ]),
          ),
        );
      setError(
        hasFieldErrors
          ? ""
          : e instanceof CheckoutError
            ? e.message
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
      if (!hasFieldErrors) errorRef.current?.focus();
      return null;
    } finally {
      busyLock.current = false;
      setBusy(false);
      setQuoting(false);
    }
  }
  async function continueToPayment() {
    if (
      !shown ||
      (!quoteReady && shown.status !== "RESERVED" && !shown.order_id) ||
      busyLock.current ||
      paymentLock.current ||
      savingAddress
    )
      return;
    paymentLock.current = true;
    setProceeding("preparing");
    setPaymentError("");
    let redirecting = false;
    try {
      const reserved =
        shown.status === "RESERVED" || shown.order_id
          ? shown
          : await action("reserve", {
              expected_version: shown.version,
              fingerprint: shown.fingerprint,
            });
      if (!reserved || reserved.status !== "RESERVED") return;
      let orderId = reserved.order_id;
      if (!orderId) {
        const storageKey = `iranti-order-create-${reserved.id}`;
        let key: string;
        try {
          key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
          sessionStorage.setItem(storageKey, key);
        } catch {
          key = crypto.randomUUID();
        }
        const order = await orderRequest<OrderRecord>(
          "/orders",
          "POST",
          {
            checkout_id: reserved.id,
            expected_version: reserved.version,
            fingerprint: reserved.fingerprint,
          },
          key,
        );
        orderId = order.id;
        apply({ ...reserved, order_id: order.id });
      }
      const result = await continueHostedPayment(orderId, () =>
        setProceeding("redirecting"),
      );
      if (result === "successful")
        router.push(`/orders/${orderId}/payment-return`);
      redirecting = true;
    } catch (failure) {
      setPaymentError(
        failure instanceof Error
          ? failure.message
          : "Payment could not be prepared. Check its status and try again.",
      );
    } finally {
      paymentLock.current = false;
      if (!redirecting) setProceeding(null);
    }
  }
  const terminal =
    shown && ["REVIEW_REQUIRED", "EXPIRED", "CANCELLED"].includes(shown.status);
  const addressDirty =
    !!shown?.contact &&
    Object.keys(blank).some(
      (key) =>
        String(address[key as keyof Address] ?? "") !==
        String(shown.contact!.address[key as keyof Address] ?? ""),
    );
  const deliveryDirty =
    !!shown?.contact &&
    (email.trim().toLowerCase() !== shown.contact.email ||
      addressDirty ||
      (!!shown.shipping_method_code &&
        selectedMethod !== shown.shipping_method_code));
  const readyAddress =
    !!email.trim() &&
    !!address.recipient_name.trim() &&
    !!address.phone.trim() &&
    !!address.line1.trim() &&
    !!address.city.trim() &&
    !!address.state_code;
  const draftSignature = JSON.stringify({ email, address, selectedMethod });
  const latestDraft = useRef(draftSignature);
  useEffect(() => {
    latestDraft.current = draftSignature;
  }, [draftSignature]);
  useEffect(() => {
    if (
      !shown ||
      !["DRAFT", "QUOTED"].includes(shown.status) ||
      shown.order_id ||
      !readyAddress ||
      !selectedMethod ||
      methodsLoading ||
      methodsError ||
      quoteError ||
      busy ||
      !methods.some((method) => method.code === selectedMethod) ||
      (shown.status === "QUOTED" && !deliveryDirty)
    )
      return;
    const attempt = `${shown.id}:${shown.version}:${draftSignature}:${quoteRetry}`;
    if (attemptedQuote.current === attempt) return;
    const timer = setTimeout(
      () => {
        if (busyLock.current) return;
        attemptedQuote.current = attempt;
        busyLock.current = true;
        setQuoting(true);
        setQuoteError(false);
        setMethodUnavailable(false);
        setFieldErrors({});
        const request = ++sequence.current;
        void (async () => {
          let next = shown;
          try {
            if (
              !shown.contact ||
              email.trim().toLowerCase() !== shown.contact.email ||
              addressDirty
            ) {
              next = await checkoutRequest<Checkout>(
                `/checkout/${shown.id}/address`,
                "PATCH",
                {
                  expected_version: shown.version,
                  email,
                  ...(selection
                    ? { saved_address_id: selection }
                    : { address }),
                },
              );
            }
            // The address mutation has already advanced the server version.
            // Keep it even if the following quote request fails.
            next = await checkoutRequest<Checkout>(
              `/checkout/${shown.id}/shipping-method`,
              "POST",
              { expected_version: next.version, code: selectedMethod },
            );
            if (request === sequence.current) {
              const hasNewerDraft = latestDraft.current !== draftSignature;
              if (!hasNewerDraft) {
                try {
                  sessionStorage.removeItem(draftKey(scope, shown.id));
                } catch {
                  /* The server-confirmed contact remains authoritative. */
                }
              }
              apply(next, hasNewerDraft, !hasNewerDraft);
            }
          } catch (failure) {
            if (request === sequence.current) {
              const hasNewerDraft = latestDraft.current !== draftSignature;
              if (!hasNewerDraft) setQuoteError(true);
              if (failure instanceof CheckoutError) {
                if (!hasNewerDraft) {
                  setMethodUnavailable(failure.code === "DELIVERY_UNAVAILABLE");
                  setFieldErrors(
                    Object.fromEntries(
                      Object.entries(failure.fields).map(([key, messages]) => [
                        key,
                        messages.join(" "),
                      ]),
                    ),
                  );
                }
                if (failure.details.checkout) next = failure.details.checkout;
                if (failure.code === "DELIVERY_UNAVAILABLE")
                  setMethodRetry((value) => value + 1);
                if (failure.code === "CHECKOUT_VERSION_CONFLICT") {
                  try {
                    next = await checkoutRequest<Checkout>(
                      `/checkout/${shown.id}`,
                    );
                  } catch {
                    // Keep the current form and expose Retry for the latest draft.
                  }
                }
              }
              if (next !== shown) apply(next, true);
            }
          } finally {
            busyLock.current = false;
            setQuoting(false);
            if (latestDraft.current !== draftSignature)
              setQuoteCycle((value) => value + 1);
          }
        })();
      },
      immediateSelection.current ? 0 : 650,
    );
    immediateSelection.current = false;
    return () => clearTimeout(timer);
    // The signature captures all address and method fields without a request per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shown?.id,
    shown?.version,
    shown?.status,
    draftSignature,
    readyAddress,
    methodsLoading,
    methodsError,
    busy,
    quoteRetry,
    quoteCycle,
    methods,
    quoteError,
  ]);
  const quoteReady =
    shown?.status === "QUOTED" &&
    verifiedCartVersion !== undefined &&
    verifiedCartVersion === cartVersion &&
    !deliveryDirty &&
    !methodsLoading &&
    !methodsError &&
    !quoteError &&
    !quoting &&
    !!shown?.fingerprint &&
    !!selectedMethod &&
    shown?.shipping_method_code === selectedMethod &&
    methods.some((method) => method.code === selectedMethod);
  const quoteRefreshing =
    shown?.status !== "RESERVED" &&
    readyAddress &&
    !!selectedMethod &&
    !methodsError &&
    !quoteError &&
    !quoteReady;
  const quoteAmount = (amount: string | null) =>
    quoteReady || shown?.status === "RESERVED" ? (
      amount === null ? (
        "—"
      ) : (
        <Price value={amount} />
      )
    ) : quoteRefreshing ? (
      <span className="checkout-amount-placeholder" aria-hidden="true" />
    ) : (
      "—"
    );
  const areas = destinations.areas.filter(
    (a) => a.state_code === address.state_code && a.locality_code !== null,
  );
  const addressAlreadySaved = saved.some((entry) =>
    sameAddress(entry, address),
  );
  useEffect(() => {
    if (
      !user ||
      !shown?.contact ||
      !quoteReady ||
      !save ||
      selection ||
      addressAlreadySaved ||
      saveAddressError ||
      saveAddressPending.current
    )
      return;
    saveAddressPending.current = true;
    queueMicrotask(() => setSavingAddress(true));
    void checkoutRequest<SavedAddress>(
      "/addresses",
      "POST",
      shown.contact.address,
    )
      .then((stored) => {
        setSaved((old) =>
          old.some((entry) => sameAddress(entry, stored))
            ? old
            : [...old, stored],
        );
        setSaveAddressError(false);
      })
      .catch(() => setSaveAddressError(true))
      .finally(() => {
        saveAddressPending.current = false;
        setSavingAddress(false);
      });
  }, [
    user,
    shown,
    quoteReady,
    save,
    selection,
    addressAlreadySaved,
    saveAddressError,
    saveAddressRetry,
  ]);
  const itemCount =
    shown?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;
  function addressField(
    key: keyof Address,
    label: string,
    autoComplete: string,
    className = "",
    type = "text",
  ) {
    const problem = fieldError(key);
    const id = `checkout-${key}`;
    return (
      <div className={`checkout-field ${className}`} key={key}>
        <label htmlFor={id}>{label}</label>
        <Input
          id={id}
          value={address[key] ?? ""}
          disabled={!!proceeding}
          type={type}
          autoComplete={autoComplete}
          inputMode={key === "postal_code" ? "numeric" : undefined}
          aria-invalid={!!problem || undefined}
          aria-describedby={problem ? `${id}-error` : undefined}
          onChange={(event) => {
            updateAddress({
              ...draftAddress.current,
              [key]: event.target.value,
            });
            setFieldErrors((old) => ({
              ...old,
              [key]: "",
              [`address.${key}`]: "",
            }));
          }}
        />
        {problem && (
          <p className="checkout-field-error" id={`${id}-error`}>
            {problem}
          </p>
        )}
      </div>
    );
  }
  return (
    <main
      id="main-content"
      className={`checkout-main${shown?.status === "RESERVED" ? " checkout-main--payment-ready" : ""}`}
    >
      <Container>
        <h1 ref={heading} tabIndex={-1}>
          Checkout
        </h1>
        <p className="checkout-intro">
          Delivery within Nigeria · Secure checkout
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
            {shown.order_id && (
              <section className="checkout-notice">
                <p>
                  Your order is ready. Continue to Paystack, or check its
                  payment status if a previous attempt is still being confirmed.
                </p>
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
                      Order summary{" "}
                      <small>
                        · {itemCount} {itemCount === 1 ? "item" : "items"}
                      </small>
                    </span>
                    <strong>
                      <span className="sr-only">
                        {quoteRefreshing
                          ? "Total pending"
                          : shown.total_minor === null ||
                              (!quoteReady && shown.status !== "RESERVED")
                            ? "Subtotal"
                            : "Total"}
                        :{" "}
                      </span>
                      {quoteRefreshing ? (
                        <span
                          className="checkout-amount-placeholder"
                          aria-hidden="true"
                        />
                      ) : (
                        <Price
                          value={
                            quoteReady || shown.status === "RESERVED"
                              ? shown.total_minor
                              : shown.subtotal_minor
                          }
                        />
                      )}
                    </strong>
                    <span className="checkout-summary-caret" aria-hidden="true">
                      ⌄
                    </span>
                  </button>
                  {quoteRefreshing && (
                    <span className="sr-only" role="status" aria-live="polite">
                      Delivery, tax and total are being recalculated.
                    </span>
                  )}
                  <div
                    id="checkout-summary-content"
                    className="checkout-summary-content"
                    data-mobile-open={mobileSummaryOpen}
                  >
                    <Link className="checkout-summary-mobile-edit" href="/cart">
                      Edit cart
                    </Link>
                    <div className="checkout-line-list">
                      <ul
                        className={
                          shown.lines.length > 4
                            ? "checkout-lines checkout-lines--scrollable"
                            : "checkout-lines"
                        }
                        aria-label="Items in your order"
                        aria-describedby={
                          shown.lines.length > 4
                            ? "checkout-items-scroll-hint"
                            : undefined
                        }
                        tabIndex={shown.lines.length > 4 ? 0 : undefined}
                      >
                        {shown.lines.map((line) => (
                          <li key={line.id}>
                            <div className="checkout-line-image">
                              {line.snapshot.image ? (
                                <ProductImage
                                  image={line.snapshot.image}
                                  sizes="64px"
                                />
                              ) : (
                                <span
                                  className="checkout-line-image-fallback"
                                  aria-hidden="true"
                                />
                              )}
                              <span
                                className="checkout-line-quantity"
                                aria-hidden="true"
                              >
                                {line.quantity}
                              </span>
                            </div>
                            <div className="checkout-line-detail">
                              <h3>{line.snapshot.name}</h3>
                              {line.snapshot.options.length > 0 && (
                                <p>{line.snapshot.options.join(" · ")}</p>
                              )}
                              {line.quantity > 1 && (
                                <p>
                                  Qty {line.quantity} ·{" "}
                                  <Price value={line.unit_price_minor} /> each
                                </p>
                              )}
                            </div>
                            <p className="checkout-line-total">
                              <Price value={line.line_subtotal_minor} />
                            </p>
                          </li>
                        ))}
                      </ul>
                      {shown.lines.length > 4 && (
                        <p
                          className="checkout-scroll-hint"
                          id="checkout-items-scroll-hint"
                        >
                          Scroll for more items
                        </p>
                      )}
                    </div>
                    <dl className="checkout-totals">
                      <div>
                        <dt>Subtotal</dt>
                        <dd>
                          <Price value={shown.subtotal_minor} />
                        </dd>
                      </div>
                      <div>
                        <dt>Delivery</dt>
                        <dd>{quoteAmount(shown.delivery_minor)}</dd>
                      </div>
                      <div>
                        <dt>Tax</dt>
                        <dd>{quoteAmount(shown.tax_minor)}</dd>
                      </div>
                      <div className="checkout-total-row">
                        <dt>Total</dt>
                        <dd>{quoteAmount(shown.total_minor)}</dd>
                      </div>
                    </dl>
                    <div className="checkout-total-feedback">
                      {quoteError && (
                        <div role="alert" className="checkout-quote-error">
                          <p>
                            {methodUnavailable
                              ? "This delivery method is no longer available. Please choose another method."
                              : "We couldn’t update your total. Please try again."}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setQuoteError(false);
                              setQuoteRetry((value) => value + 1);
                            }}
                          >
                            Retry
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
                <div className="checkout-flow">
                  {shown.status !== "RESERVED" || proceeding ? (
                    <form
                      method="post"
                      onSubmit={(event) => event.preventDefault()}
                      noValidate
                      aria-describedby="checkout-errors"
                    >
                      <section className="checkout-section">
                        <h2>Contact</h2>
                        <div className="checkout-field">
                          <label htmlFor="checkout-email">Email</label>
                          <Input
                            id="checkout-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => {
                              draftEmail.current = event.target.value;
                              markEmailDraft(event.target.value);
                              setEmail(event.target.value);
                              persistDraft(
                                event.target.value,
                                draftAddress.current,
                              );
                              setFieldErrors((old) => ({ ...old, email: "" }));
                            }}
                            aria-invalid={!!fieldError("email") || undefined}
                            aria-describedby={
                              fieldError("email")
                                ? "checkout-email-error"
                                : undefined
                            }
                            required
                            disabled={busy || !!proceeding}
                          />
                          {fieldError("email") && (
                            <p
                              className="checkout-field-error"
                              id="checkout-email-error"
                            >
                              {fieldError("email")}
                            </p>
                          )}
                        </div>
                      </section>
                      <section className="checkout-section">
                        <h2>Delivery</h2>
                        {user && saved.length > 0 && (
                          <label className="checkout-field checkout-field--full">
                            Saved address
                            <Select
                              value={selection}
                              disabled={!!proceeding}
                              onChange={(event) => {
                                setSelection(event.target.value);
                                const selected = saved.find(
                                  (entry) => entry.id === event.target.value,
                                );
                                if (selected) {
                                  const { id: ignored, ...rest } = selected;
                                  void ignored;
                                  updateAddress(rest);
                                } else updateAddress(blank);
                              }}
                            >
                              <option value="">Enter a new address</option>
                              {saved.map((entry) => (
                                <option value={entry.id} key={entry.id}>
                                  {entry.recipient_name} — {entry.line1},{" "}
                                  {entry.city}
                                </option>
                              ))}
                            </Select>
                          </label>
                        )}
                        <div className="checkout-country">
                          <span>Country / Region</span>
                          <strong>Nigeria</strong>
                        </div>
                        <fieldset
                          disabled={busy || !!selection || !!proceeding}
                        >
                          <legend className="sr-only">Delivery address</legend>
                          <div className="checkout-fields">
                            {addressField(
                              "recipient_name",
                              "Full name",
                              "shipping name",
                              "checkout-field--full",
                            )}
                            {addressField(
                              "line1",
                              "Address",
                              "shipping address-line1",
                              "checkout-field--full",
                            )}
                            {addressField(
                              "line2",
                              "Apartment / Suite (optional)",
                              "shipping address-line2",
                              "checkout-field--full",
                            )}
                            {addressField(
                              "city",
                              "City",
                              "shipping address-level2",
                            )}
                            <div className="checkout-field">
                              <label htmlFor="checkout-state">State</label>
                              <Select
                                id="checkout-state"
                                autoComplete="shipping address-level1"
                                value={address.state_code}
                                aria-invalid={
                                  !!fieldError("state_code") || undefined
                                }
                                aria-describedby={
                                  fieldError("state_code")
                                    ? "checkout-state-error"
                                    : undefined
                                }
                                onChange={(event) => {
                                  updateAddress({
                                    ...draftAddress.current,
                                    state_code: event.target.value,
                                    locality_code: null,
                                  });
                                  setFieldErrors((old) => ({
                                    ...old,
                                    state_code: "",
                                    "address.state_code": "",
                                  }));
                                }}
                              >
                                <option value="">Choose a state</option>
                                {Object.entries(destinations.states).map(
                                  ([code, name]) => (
                                    <option key={code} value={code}>
                                      {name}
                                    </option>
                                  ),
                                )}
                              </Select>
                              {fieldError("state_code") && (
                                <p
                                  className="checkout-field-error"
                                  id="checkout-state-error"
                                >
                                  {fieldError("state_code")}
                                </p>
                              )}
                            </div>
                            {areas.length > 0 && (
                              <label
                                className="checkout-field checkout-field--full"
                                htmlFor="checkout-area"
                              >
                                Delivery area
                                <Select
                                  id="checkout-area"
                                  value={address.locality_code ?? ""}
                                  onChange={(event) =>
                                    updateAddress({
                                      ...draftAddress.current,
                                      locality_code: event.target.value || null,
                                    })
                                  }
                                >
                                  <option value="">
                                    State-wide coverage, if configured
                                  </option>
                                  {areas.map((area) => (
                                    <option
                                      key={area.locality_code}
                                      value={area.locality_code!}
                                    >
                                      {area.locality_code!.replaceAll("_", " ")}
                                    </option>
                                  ))}
                                </Select>
                              </label>
                            )}
                            {addressField(
                              "postal_code",
                              "Postal code (optional)",
                              "shipping postal-code",
                            )}
                            {addressField("phone", "Phone", "tel", "", "tel")}
                          </div>
                        </fieldset>
                        {user && (
                          <>
                            <label className="checkout-save">
                              <input
                                type="checkbox"
                                checked={save || addressAlreadySaved}
                                disabled={
                                  addressAlreadySaved ||
                                  savingAddress ||
                                  !!proceeding
                                }
                                onChange={(event) => {
                                  setSave(event.target.checked);
                                  setSaveAddressError(false);
                                }}
                              />
                              {addressAlreadySaved
                                ? "Address saved to your account"
                                : savingAddress
                                  ? "Saving address to your account…"
                                  : "Save this address to my account"}
                            </label>
                            {saveAddressError && (
                              <p
                                className="checkout-section-warning"
                                role="alert"
                              >
                                This address could not be saved.{" "}
                                <button
                                  type="button"
                                  disabled={!!proceeding}
                                  onClick={() => {
                                    setSaveAddressError(false);
                                    setSaveAddressRetry((value) => value + 1);
                                  }}
                                >
                                  Retry saving
                                </button>
                              </p>
                            )}
                          </>
                        )}
                      </section>
                    </form>
                  ) : shown.contact ? (
                    <div className="checkout-confirmed-details">
                      <section className="checkout-section">
                        <h2>Contact</h2>
                        <p>{shown.contact.email}</p>
                      </section>
                      <section className="checkout-section">
                        <h2>Delivery</h2>
                        <address>
                          {shown.contact.address.recipient_name}
                          <br />
                          {shown.contact.address.line1}
                          <br />
                          {shown.contact.address.city},{" "}
                          {shown.contact.address.state_code}
                          <br />
                          {shown.contact.address.phone}
                        </address>
                      </section>
                    </div>
                  ) : null}
                  <section className="checkout-section checkout-shipping-section">
                    <h2 ref={shippingHeading} tabIndex={-1}>
                      Shipping method
                    </h2>
                    {methodsLoading ? (
                      <p role="status">Loading delivery options…</p>
                    ) : methodsError ? (
                      <div role="alert">
                        <p>
                          We couldn&apos;t load delivery options. Please try
                          again.
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setMethodRetry((n) => n + 1);
                          }}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : address.state_code && methods.length === 0 ? (
                      <p role="status">
                        {areas.length > 0 && !address.locality_code
                          ? "Choose a delivery area to see available methods."
                          : "Delivery is not currently available for this state."}
                      </p>
                    ) : methods.length > 0 ? (
                      <fieldset disabled={!!proceeding}>
                        <legend className="sr-only">
                          Available shipping methods
                        </legend>
                        {methods.map((method) => (
                          <label
                            className={`checkout-method${selectedMethod === method.code ? " checkout-method--selected" : ""}`}
                            key={method.code}
                          >
                            <input
                              type="radio"
                              name="shipping-method"
                              value={method.code}
                              checked={selectedMethod === method.code}
                              onChange={() => {
                                immediateSelection.current = true;
                                latestDraft.current = JSON.stringify({
                                  email: draftEmail.current,
                                  address: draftAddress.current,
                                  selectedMethod: method.code,
                                });
                                setSelectedMethod(method.code);
                                setQuoteError(false);
                              }}
                            />
                            <span>
                              <strong>{method.name}</strong>
                              {(method.description || method.estimate) && (
                                <small>
                                  {[method.description, method.estimate]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              )}
                            </span>
                            <strong>
                              <Price value={method.amount_minor} />
                            </strong>
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <p>Select a state to see delivery options.</p>
                    )}
                    {addressDirty && (
                      <p className="checkout-section-warning" role="status">
                        Your delivery details changed. The total will refresh
                        automatically.
                      </p>
                    )}
                  </section>
                  <section className="checkout-section checkout-payment-section">
                    <h2 ref={paymentHeading} tabIndex={-1}>
                      Payment
                    </h2>
                    <fieldset disabled={!!proceeding}>
                      <legend className="sr-only">Payment provider</legend>
                      <label className="checkout-method checkout-method--payment">
                        <input
                          type="radio"
                          name="payment-provider"
                          checked
                          readOnly
                        />
                        <span>
                          <strong>Paystack</strong>
                          <small>
                            Choose an available payment method after continuing.
                          </small>
                        </span>
                      </label>
                    </fieldset>
                    <p className="checkout-payment-security">
                      Payments are processed securely by Paystack.
                    </p>
                    {shown.status === "RESERVED" && !shown.order_id && (
                      <p className="checkout-reservation-note" role="status">
                        Your items are reserved until{" "}
                        <time dateTime={shown.expires_at}>
                          {new Date(shown.expires_at).toLocaleString()}
                        </time>
                        .
                      </p>
                    )}
                  </section>
                  <section
                    className={`checkout-next-step${shown.status === "DRAFT" || deliveryDirty ? " checkout-next-step--quiet" : ""}`}
                    aria-label="Continue checkout"
                  >
                    {shown.status !== "RESERVED" && !shown.order_id && (
                      <>
                        <p>
                          {quoteReady || quoteRefreshing
                            ? "Review the delivery, tax and total before continuing."
                            : !readyAddress
                              ? "Complete your delivery details to continue."
                              : !selectedMethod
                                ? "Select a delivery method to continue."
                                : "Review your delivery details before continuing."}
                        </p>
                      </>
                    )}
                    {paymentError && (
                      <p
                        id="checkout-payment-error"
                        className="checkout-payment-error"
                        role="alert"
                      >
                        {paymentError}
                      </p>
                    )}
                    <Button
                      className="checkout-payment-submit"
                      onClick={() => void continueToPayment()}
                      disabled={
                        (!quoteReady &&
                          shown.status !== "RESERVED" &&
                          !shown.order_id) ||
                        !!proceeding ||
                        busy ||
                        savingAddress
                      }
                      aria-describedby={
                        paymentError ? "checkout-payment-error" : undefined
                      }
                    >
                      {proceeding === "preparing"
                        ? "Preparing payment…"
                        : proceeding === "redirecting"
                          ? "Redirecting to Paystack…"
                          : "Continue to payment"}
                    </Button>
                    <span className="sr-only" role="status" aria-live="polite">
                      {proceeding === "preparing"
                        ? "Preparing payment…"
                        : proceeding === "redirecting"
                          ? "Redirecting to Paystack…"
                          : ""}
                    </span>
                    {!shown.order_id && (
                      <Button
                        className="checkout-cancel"
                        variant="quiet"
                        disabled={busy || !!proceeding}
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
                    )}
                  </section>
                </div>
              </div>
            )}
          </>
        )}
      </Container>
    </main>
  );
}
