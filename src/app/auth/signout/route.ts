import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { clientEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST only. A GET sign-out can be triggered by any image tag or prefetch on a
 * page the user visits, which makes logging people out a one-line CSRF.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", clientEnv.NEXT_PUBLIC_APP_URL), { status: 303 });
}
