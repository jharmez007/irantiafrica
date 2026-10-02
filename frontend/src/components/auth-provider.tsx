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
import { ApiError, authRequest, type Identity } from "@/lib/auth-api";
import { usePathname, useRouter } from "next/navigation";
import { listenForSessionFailures } from "@/lib/session-events";
import { toast } from "@/lib/toast";

const AuthContext = createContext<{
  user: Identity | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Identity | null>(null);
  const userRef = useRef<Identity | null>(null);
  const expiredRef = useRef(false);
  const epochRef = useRef(0);
  const logoutRef = useRef<Promise<void> | null>(null);
  const probeRef = useRef(false);
  const csrfRefreshRef = useRef<Promise<void> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const epoch = epochRef.current;
    try {
      const current = await authRequest<Identity>("/auth/me");
      if (epoch !== epochRef.current) return;
      setError("");
      setUser(current);
      userRef.current = current;
      expiredRef.current = false;
    } catch (error) {
      if (epoch !== epochRef.current) return;
      setUser(null);
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        userRef.current &&
        !expiredRef.current
      ) {
        expiredRef.current = true;
        toast.warning("Your session has expired. Please sign in again.");
        router.replace("/login");
      }
      if (error instanceof ApiError && error.status === 401)
        epochRef.current += 1;
      userRef.current = null;
      if (!(error instanceof ApiError && error.status === 401))
        setError("Unable to load your session. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    let active = true;
    const epoch = epochRef.current;
    authRequest<Identity>("/auth/me")
      .then((current) => {
        if (active && epoch === epochRef.current) {
          setUser(current);
          userRef.current = current;
          expiredRef.current = false;
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (active && epoch === epochRef.current) {
          setUser(null);
          if (failure instanceof ApiError && failure.status === 401) {
            epochRef.current += 1;
            userRef.current = null;
            expiredRef.current = true;
            if (
              pathname.startsWith("/admin") ||
              pathname.startsWith("/account") ||
              pathname === "/mfa"
            ) {
              toast.warning("Your session has expired. Please sign in again.");
              router.replace("/login");
            }
          } else setError("Unable to load your session. Please retry.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pathname, router]);
  useEffect(
    () =>
      listenForSessionFailures(({ status }) => {
        if (status === 419) {
          toast.warning(
            "Your security check expired. Please retry this action.",
          );
          if (!csrfRefreshRef.current) {
            csrfRefreshRef.current = fetch("/sanctum/csrf-cookie", {
              credentials: "include",
              cache: "no-store",
            })
              .then((response) => {
                if (!response.ok) throw new Error("CSRF refresh failed");
              })
              .catch(() => {
                toast.error(
                  "Unable to refresh the security check. Please try again.",
                );
              })
              .finally(() => {
                csrfRefreshRef.current = null;
              });
          }
          return;
        }
        if (!userRef.current || expiredRef.current || probeRef.current) return;
        probeRef.current = true;
        void authRequest<Identity>("/auth/me")
          .then(() => {
            // A 401 from an order-scoped capability can occur while login is valid.
          })
          .catch((failure: unknown) => {
            if (
              !(failure instanceof ApiError && failure.status === 401) ||
              expiredRef.current
            )
              return;
            expiredRef.current = true;
            epochRef.current += 1;
            userRef.current = null;
            setUser(null);
            setError("");
            toast.warning(
              "Your session has expired. Please sign in again.",
              "Any action you just tried was not saved.",
            );
            if (
              !pathname.startsWith("/login") &&
              !pathname.startsWith("/register") &&
              !pathname.startsWith("/forgot-password")
            )
              router.replace("/login");
          })
          .finally(() => {
            probeRef.current = false;
          });
      }),
    [pathname, router],
  );
  function logout(): Promise<void> {
    if (logoutRef.current) return logoutRef.current;
    const pending = (async () => {
      try {
        await authRequest("/auth/logout", {});
        epochRef.current += 1;
        userRef.current = null;
        setUser(null);
        setError("");
        toast.success("Signed out successfully");
      } catch (failure) {
        if (
          failure instanceof ApiError &&
          (failure.status === 401 || failure.status === 419)
        ) {
          // A stale CSRF token may accompany an expired session. Probe the
          // authoritative identity endpoint before treating it as signed out.
          if (failure.status === 419) {
            await fetch("/sanctum/csrf-cookie", {
              credentials: "include",
              cache: "no-store",
            });
          }
          try {
            await authRequest("/auth/me");
          } catch (probe) {
            if (probe instanceof ApiError && probe.status === 401) {
              userRef.current = null;
              epochRef.current += 1;
              setUser(null);
              setError("");
              toast.warning("Your session has expired. Please sign in again.");
              return;
            }
          }
        }
        throw failure;
      }
    })();
    logoutRef.current = pending;
    void pending
      .finally(() => {
        logoutRef.current = null;
      })
      .catch(() => {});
    return pending;
  }
  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required.");
  return auth;
}
