"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "../lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL_BASE || "http://localhost:8000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/me`, { method: "HEAD" });
    } catch {
      setLoading(false);
      setError("Server is down. Please try again.");
      return;
    }
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push(redirectTo);
  }

  async function handleGoogleSignIn() {
    setError(null);
    try {
      await fetch(`${API_BASE}/auth/me`, { method: "HEAD" });
    } catch {
      setError("Server is down. Please try again.");
      return;
    }
    const supabase = createClient();
    // Google OAuth: In Google Cloud Console → Credentials → OAuth client →
    // Authorized redirect URIs must include: https://<project-ref>.supabase.co/auth/v1/callback
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${redirectTo}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (err) setError(err.message);
  }

  return (
    <div className="login-page" style={{ maxWidth: 360, margin: "4rem auto", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: "1rem" }}>Sign in</h1>
      {error && (
        <div role="alert" style={{ color: "var(--error, #c00)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label>
          <span style={{ display: "block", marginBottom: 4 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span style={{ display: "block", marginBottom: 4 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: "0.5rem 1rem" }}>
          {loading ? "Signing in…" : "Sign in with email"}
        </button>
      </form>
      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <span style={{ marginRight: "0.5rem" }}>or</span>
      </div>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        style={{ marginTop: "1rem", width: "100%", padding: "0.5rem 1rem" }}
      >
        Sign in with Google
      </button>
      <p style={{ marginTop: "2rem", fontSize: "0.9rem" }}>
        <Link href="/">Back to home</Link>
      </p>
    </div>
  );
}
