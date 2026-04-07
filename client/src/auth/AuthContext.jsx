import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/http";

const AuthContext = createContext(null);
const STORAGE_KEY = "reader-diary-auth";

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      setAuthReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setToken(parsed.token || "");
      setUser(parsed.user || null);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token,
        user,
      }),
    );
  }, [token, user]);

  useEffect(() => {
    if (!token) {
      return;
    }

    apiRequest("/auth/me", { token })
      .then((data) => setUser(data.user))
      .catch(() => {
        setToken("");
        setUser(null);
      });
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      authReady,
      isAuthenticated: Boolean(token),
      login: (payload) => {
        setToken(payload.token);
        setUser(payload.user);
      },
      logout: () => {
        setToken("");
        setUser(null);
      },
    }),
    [token, user, authReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

