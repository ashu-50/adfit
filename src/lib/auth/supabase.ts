import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";

// The browser client lives in ./supabase-browser so client components never
// reach this module, which imports next/headers.

/**
 * Server components can read cookies but cannot write them, so the setAll
 * handler swallows its error. Session refresh happens in middleware, which can
 * write, and that is the only place it needs to.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // `cookies` is a union of the current and deprecated method shapes, so
      // TypeScript cannot contextually type these parameters. Annotate them.
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware already refreshed it.
        }
      },
    },
  });
}

let adminClient: ReturnType<typeof createClient> | null = null;

/** Service-role client. Bypasses RLS — use only for storage and admin tasks. */
export function createSupabaseAdminClient() {
  if (!adminClient) {
    adminClient = createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
