"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, authRequest, type Identity } from "@/lib/auth-api";

const AuthContext = createContext<{
  user: Identity | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const current = await authRequest<Identity>("/auth/me");
      setError("");
      setUser(current);
    } catch (error) {
      setUser(null);
      if (!(error instanceof ApiError && error.status === 401))
        setError("Unable to load your session. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    authRequest<Identity>("/auth/me")
      .then((current) => {
        if (active) {
          setUser(current);
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setUser(null);
          if (!(failure instanceof ApiError && failure.status === 401))
            setError("Unable to load your session. Please retry.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function logout() {
    await authRequest("/auth/logout", {});
    setUser(null);
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
