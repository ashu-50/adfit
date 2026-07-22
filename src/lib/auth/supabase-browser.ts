import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/**
 * Browser client only.
 *
 * Kept apart from supabase.ts on purpose: that module imports `next/headers`,
 * which cannot exist in a client bundle. Sharing one file means every component
 * that wants a browser client drags a server-only import along with it and the
 * build fails — or worse, would leak server internals if it did not.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
