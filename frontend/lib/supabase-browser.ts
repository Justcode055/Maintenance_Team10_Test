import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

export function createBrowserSupabaseClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase frontend environment variables are missing");
  }

  if (!accessToken) {
    browserClient ??= createClient(url, anonKey);
    return browserClient;
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}
