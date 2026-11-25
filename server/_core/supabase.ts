import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export function createSupabaseClient() {
  const url = ENV.supabaseUrl;
  const anonKey = ENV.supabaseAnonKey;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured");
  }
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createSupabaseAdminClient() {
  const url = ENV.supabaseUrl;
  const serviceRoleKey = ENV.supabaseServiceRoleKey;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the server");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
