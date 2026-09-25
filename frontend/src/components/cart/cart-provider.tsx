"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { cartRequest, CartApiError, type CartData } from "@/lib/cart-api";

type CartContextValue = {
  cart: CartData | null;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  refresh: () => Promise<void>;
  add: (variantId: string) => Promise<boolean>;
  update: (itemId: string, quantity: number) => Promise<boolean>;
  remove: (itemId: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
};
const CartContext = createContext<CartContextValue | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const scope = authLoading ? "pending" : (user?.id ?? "guest");
  const allowed =
    !authLoading && (!user || user.authentication_state === "authenticated");
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    data: CartData;
  } | null>(null);
  const [feedback, setFeedback] = useState({
    scope: "",
    error: "",
    notice: "",
  });
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const locked = useRef(false);
  const sequence = useRef(0);
  const confirmed = useRef<{ scope: string; data: CartData } | null>(null);
  const invalidate = useCallback(() => {
    sequence.current += 1;
  }, []);
  const cart = snapshot?.scope === scope ? snapshot.data : null;
  const accept = useCallback(
    (data: CartData) => {
      const previous = confirmed.current;
      const changed =
        previous?.scope === scope &&
        data.items.some((line) =>
          previous.data.items.some(
            (old) =>
              old.variant_id === line.variant_id &&
              old.unit_price_minor !== line.unit_price_minor,
          ),
        );
      confirmed.current = { scope, data };
      setSnapshot({ scope, data });
      return changed ? "A price changed; review the current prices." : "";
    },
    [scope],
  );
  const refresh = useCallback(async () => {
    if (!allowed || locked.current) return;
    const request = ++sequence.current;
    setFetching(true);
    try {
      const data = await cartRequest();
      if (request === sequence.current) {
        const notice = accept(data);
        setFeedback({ scope, error: "", notice });
      }
    } catch (e) {
      if (request === sequence.current)
        setFeedback({
          scope,
          error: e instanceof Error ? e.message : "Unable to load your cart.",
          notice: "",
        });
    } finally {
      if (request === sequence.current) setFetching(false);
    }
  }, [allowed, scope, accept]);
  useEffect(() => {
    let active = true;
    const request = ++sequence.current;
    if (allowed) {
      cartRequest()
        .then((data) => {
          if (active && request === sequence.current) {
            const notice = accept(data);
            setFeedback({ scope, error: "", notice });
          }
        })
        .catch((e: unknown) => {
          if (active)
            setFeedback({
              scope,
              error:
                e instanceof Error ? e.message : "Unable to load your cart.",
              notice: "",
            });
        })
        .finally(() => {
          if (active) setFetching(false);
        });
    }
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      invalidate();
      window.removeEventListener("focus", onFocus);
    };
  }, [allowed, scope, accept, refresh, invalidate]);

  async function mutate(
    method: string,
    suffix: string,
    payload: Record<string, string | number> = {},
  ): Promise<boolean> {
    if (!allowed || !cart || locked.current) return false;
    locked.current = true;
    setBusy(true);
    const request = ++sequence.current;
    setFeedback({ scope, error: "", notice: "" });
    try {
      const data = await cartRequest(method, suffix, {
        ...payload,
        expected_version: cart.version,
      });
      if (request !== sequence.current) return false;
      accept(data);
      const priceChanged = data.items.some((line) =>
        cart.items.some(
          (old) =>
            old.variant_id === line.variant_id &&
            old.unit_price_minor !== line.unit_price_minor,
        ),
      );
      setFeedback({
        scope,
        error: "",
        notice: priceChanged
          ? "Cart updated. A price changed; review the current prices."
          : "Cart updated.",
      });
      return true;
    } catch (e) {
      // Unknown response outcomes are reconciled, never automatically re-added.
      if (request !== sequence.current) return false;
      try {
        const latest = await cartRequest();
        if (request === sequence.current) accept(latest);
      } catch {
        /* Keep the last confirmed view with an explicit error. */
      }
      if (request !== sequence.current) return false;
      setFeedback({
        scope,
        error:
          e instanceof CartApiError && e.status === 409
            ? `${e.message} Review the refreshed cart; the previous request may already have completed.`
            : e instanceof Error
              ? e.message
              : "Unable to update your cart.",
        notice: "",
      });
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
      setFetching(false);
    }
  }
  const error = feedback.scope === scope ? feedback.error : "";
  return (
    <CartContext.Provider
      value={{
        cart,
        loading: authLoading || (allowed && !cart && !error) || fetching,
        busy,
        error:
          !allowed && !authLoading
            ? "Complete staff verification before using your personal cart."
            : error,
        notice: feedback.scope === scope ? feedback.notice : "",
        refresh,
        add: (id) => mutate("POST", "/items", { variant_id: id, quantity: 1 }),
        update: (id, quantity) => mutate("PATCH", `/items/${id}`, { quantity }),
        remove: (id) => mutate("DELETE", `/items/${id}`),
        clear: () => mutate("DELETE", ""),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("CartProvider is required.");
  return value;
}
