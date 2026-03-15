"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "../lib/supabase";
import { setApiAccessToken, setOnUnauthorized } from "../lib/api";
import type { User, Session } from "@supabase/supabase-js";

type AuthUser = { id: string; email: string; is_admin: boolean };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  authUser: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL_BASE || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshAuthUser = useCallback(async () => {
    const supabase = createClient();
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) {
      setAuthUser(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${s.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuthUser({
          id: data.id,
          email: data.email,
          is_admin: !!data.is_admin,
        });
      } else {
        setAuthUser(null);
      }
    } catch {
      setAuthUser(null);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    void (async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      setSession(s);
      setUser(s?.user ?? null);
      setApiAccessToken(s?.access_token ?? null);
      if (s) {
        await refreshAuthUser();
      }
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setApiAccessToken(s?.access_token ?? null);
      if (s) refreshAuthUser();
      else setAuthUser(null);
    });
    return () => subscription.unsubscribe();
  }, [refreshAuthUser]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAuthUser(null);
    setApiAccessToken(null);
    router.push("/login");
  }, [router]);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  useEffect(() => {
    setOnUnauthorized(() => () => signOutRef.current());
    return () => setOnUnauthorized(null);
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    authUser,
    loading,
    signOut,
    refreshAuthUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Client component: redirect to /login if not authenticated (except on /login). */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (pathname === "/login") return;
    if (!session) {
      router.replace("/login");
    }
  }, [loading, session, pathname, router]);

  if (loading) {
    return (
      <div className="auth-loading" style={{ padding: "2rem", textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  if (pathname === "/login") return <>{children}</>;
  if (!session) return null;
  return <>{children}</>;
}
