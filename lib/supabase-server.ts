// Server-only Supabase client. Never import this file from a component
// that runs in the browser: it reads the secret key.
//
// New Supabase keys (2025+):
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — safe to expose, replaces anon key
//   SUPABASE_SECRET_KEY                 — server-only, replaces service-role key
// Legacy names still supported for compatibility:
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// SECURITY:
//   - Secret / service-role keys MUST NOT carry the NEXT_PUBLIC_ prefix.
//     They must never be bundled to the browser.
//   - This module is only imported by server routes / lib/store.ts.
import { createClient } from "@supabase/supabase-js";

export function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
}

export function publishableKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    null
  );
}

export function secretKey(): string | null {
  // Server-only. Deliberately no NEXT_PUBLIC_ variant.
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && (secretKey() || publishableKey()));
}

let cached: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (missing URL or key)");
  }
  if (cached) return cached;
  const url = supabaseUrl()!;
  // Prefer secret (bypasses RLS server-side). Fallback to publishable/anon.
  const key = secretKey() || publishableKey()!;
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
