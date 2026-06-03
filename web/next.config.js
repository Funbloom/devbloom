const fs = require("fs");
const path = require("path");
const { loadEnvConfig } = require("@next/env");

const webRoot = path.resolve(__dirname);
loadEnvConfig(webRoot, process.env.NODE_ENV !== "production");

/** Load `web/env.local` — values here override `.env*` (matches local `api/env` naming). */
function mergeEnvLocalNoLeadingDot(webDir) {
  const candidate = path.join(webDir, "env.local");
  if (!fs.existsSync(candidate)) {
    return;
  }
  const text = fs.readFileSync(candidate, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const naked = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eq = naked.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = naked.slice(0, eq).trim();
    let value = naked.slice(eq + 1).trim();
    const last = value.length - 1;
    if (last >= 1) {
      const q = value[0];
      if ((q === '"' || q === "'") && value[last] === q) {
        value = value.slice(1, -1);
      }
    }
    process.env[key] = value;
  }
}

mergeEnvLocalNoLeadingDot(__dirname);

/** Align with `api/env`: SUPABASE_* → NEXT_PUBLIC_* for the browser client (anon key only, never service role). */
function bridgeSupabaseBrowserEnv() {
  const urlCandidate =
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim() ||
    (process.env.SUPABASE_URL || "").trim();
  if (urlCandidate) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = urlCandidate;
  }
  const anonCandidate =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim() ||
    (process.env.SUPABASE_ANON_KEY || "").trim();
  if (anonCandidate) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonCandidate;
  }
}

bridgeSupabaseBrowserEnv();

/** Local dev: Installation → Install / Latest version need this (production sets it at build). */
if (
  process.env.NODE_ENV !== "production" &&
  !(process.env.NEXT_PUBLIC_LOCAL_AGENT_DOWNLOAD_URL || "").trim()
) {
  process.env.NEXT_PUBLIC_LOCAL_AGENT_DOWNLOAD_URL =
    "https://dev.funbloomstudio.com/downloads/local-agent/latest.zip";
}

const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabasePublicAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabasePublicUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabasePublicAnon,
  },
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return {
      // Run before filesystem so /images/* is proxied to the API, not 404 from missing static file
      beforeFiles: [
        { source: "/images/:path*", destination: `${apiUrl}/images/:path*` },
      ],
    };
  },
};

module.exports = nextConfig;
