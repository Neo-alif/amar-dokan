// Server-only Supabase client (service_role). The key has no NEXT_PUBLIC_ prefix,
// so it is never bundled for the browser. The browser never talks to Supabase.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export function shopId(): string {
  const id = process.env.DEMO_SHOP_ID;
  if (!id) throw new Error("DEMO_SHOP_ID not set (run npm run seed)");
  return id;
}
