import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";
import { isConfiguredSecret } from "@/lib/security";

export function createSupabaseAdminClient() {
  const { url } = supabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isConfiguredSecret(serviceRoleKey)) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
