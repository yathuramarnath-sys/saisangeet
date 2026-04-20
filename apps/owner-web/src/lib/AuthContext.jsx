import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

/** Decode JWT payload without verifying signature (client-side only). */
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pos_token");
    if (!token) {
      setLoading(false);
      return;
    }

    // Try to verify with backend; fall back to local JWT decode if backend unreachable
    api.get("/auth/me")
      .then((u) => setUser(u))
      .catch((err) => {
        const isNetworkError = err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError");
        if (isNetworkError) {
          // Backend offline — trust the locally stored token
          const payload = decodeJwtPayload(token);
          if (payload && payload.exp * 1000 > Date.now()) {
            setUser({
              id: payload.sub,
              fullName: payload.fullName || "Owner",
              outletId: payload.outletId || null,
              roles: payload.roles || [],
              permissions: payload.permissions || []
            });
            return;
          }
        }
        // 401 or invalid token — clear it
        localStorage.removeItem("pos_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier, password) => {
    const result = await api.post("/auth/login", { identifier, password });
    localStorage.setItem("pos_token", result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const signup = useCallback(async (fields) => {
    const result = await api.post("/auth/signup", fields);
    localStorage.setItem("pos_token", result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
    } catch (_) {
      // ignore — e.g. expired token; we still need to clear local state
    } finally {
      localStorage.removeItem("pos_token");
      setUser(null);
      // Hard redirect so BrowserRouter is re-initialised cleanly from /login
      window.location.href = "/login";
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
