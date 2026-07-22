import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages that require a session. API routes authenticate themselves via
 *  requireUser() so they can answer 401 JSON instead of redirecting. */
const PROTECTED = ["/dashboard", "/analyses", "/projects", "/settings", "/new"];

/** Signed-in users have no business on these. */
const AUTH_ONLY = ["/login", "/signup"];

export async function middleware(req: NextRequest) {
  // This response is the one that carries refreshed auth cookies. Creating a
  // different NextResponse later and returning that instead is the classic way
  // to silently log everyone out every hour.
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  // Must be getUser(), not getSession(): only getUser() revalidates the token
  // with the auth server, and the call is what triggers the refresh-cookie
  // write above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (user && AUTH_ONLY.some((p) => path === p)) {
    const home = req.nextUrl.clone();
    home.pathname = "/dashboard";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return res;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets, image optimisation, and the Stripe
     * webhook. The webhook is unauthenticated by design and touching its
     * request here would be pure latency on a path Stripe times out quickly.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
