import { createClient } from "./supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL_BASE || "http://localhost:8000";

/** Token set by AuthContext when session is available so API always uses the same session the UI has. */
let apiAccessToken: string | null = null;

export function setApiAccessToken(token: string | null): void {
  apiAccessToken = token;
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (apiAccessToken) return { Authorization: `Bearer ${apiAccessToken}` };
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

/** Called when API returns 401 so the app can sign out and redirect to login. */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export async function fetchApi(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = await authHeaders();
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });
  if (res.status === 401) {
    setApiAccessToken(null);
    onUnauthorized?.();
  }
  return res;
}

export { API_BASE };
