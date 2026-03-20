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
/** Called when API returns 401 to show user-facing message. */
let onUnauthorizedMessage: (() => void) | null = null;
/** Called when API is unreachable or down. */
let onServerDown: (() => void) | null = null;
export function setOnUnauthorized(fn: (() => void) | null): void {
  onUnauthorized = fn;
}
export function setOnUnauthorizedMessage(fn: (() => void) | null): void {
  onUnauthorizedMessage = fn;
}
export function setOnServerDown(fn: (() => void) | null): void {
  onServerDown = fn;
}

export async function fetchApi(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = await authHeaders();
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });
  } catch (err) {
    onServerDown?.();
    throw err;
  }
  if ([502, 503, 504].includes(res.status)) {
    onServerDown?.();
  }
  if (res.status === 401) {
    setApiAccessToken(null);
    onUnauthorizedMessage?.();
    onUnauthorized?.();
  }
  return res;
}

export { API_BASE };
