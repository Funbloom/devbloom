import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function createClient() {
  const url = supabaseUrl.trim();
  const key = supabaseAnonKey.trim();
  if (!url || !key) {
    throw new Error(
      "Supabase browser client is missing configuration. After editing web/env.local, restart `npm run dev`.\n" +
        `- Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY).\n` +
        `- Use the anon / public JWT from Supabase Dashboard → Project Settings → API — not the service_role key.\n` +
        `Missing: ${!url ? "URL " : ""}${!key ? "anon key" : ""}`
    );
  }
  return createBrowserClient(url, key);
}
