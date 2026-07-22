import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ mod: "auth.callback" });

/**
 * Redirect targets come in on the query string, so they are attacker-supplied.
 * Only same-origin relative paths are honoured; `//evil.com` is a protocol
 * relative URL that browsers happily follow off-site, hence the second check.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

/** Absolute URLs are built from configured origin, never the Host header. */
function to(path: string): URL {
  return new URL(path, clientEnv.NEXT_PUBLIC_APP_URL);
}

function toError(message: string, next: string): URL {
  const url = to("/login");
  url.searchParams.set("error", message);
  if (next !== "/dashboard") url.searchParams.set("next", next);
  return url;
}

/**
 * Lands both auth flows Supabase can send us:
 *   OAuth / magic link  -> ?code=...            (PKCE exchange)
 *   Email confirmation  -> ?token_hash=&type=   (OTP verification)
 *
 * Cookies are writable inside a route handler, so this is where the session
 * actually gets persisted; middleware only refreshes it afterwards.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const next = safeNext(params.get("next"));

  const providerError = params.get("error_description") ?? params.get("error");
  if (providerError) {
    log.warn("identity provider returned an error", { error: providerError });
    return NextResponse.redirect(toError(providerError, next));
  }

  const supabase = await createSupabaseServerClient();

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log.warn("code exchange failed", { error: error.message });
      return NextResponse.redirect(toError("That sign-in link is no longer valid. Request a new one.", next));
    }
    return NextResponse.redirect(to(next));
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      log.warn("otp verification failed", { error: error.message });
      return NextResponse.redirect(toError("That confirmation link has expired. Request a new one.", next));
    }
    return NextResponse.redirect(to(next));
  }

  return NextResponse.redirect(toError("That sign-in link was incomplete.", next));
}
