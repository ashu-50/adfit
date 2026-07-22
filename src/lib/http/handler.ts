import { NextRequest } from "next/server";
import { z } from "zod";
import { fail } from "./response";
import { badRequest } from "./errors";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type RouteContext<P = Record<string, string>> = { params: Promise<P> };

type HandlerArgs<TBody, TQuery, P> = {
  req: NextRequest;
  user: SessionUser;
  body: TBody;
  query: TQuery;
  params: P;
  requestId: string;
};

type Options<TBody, TQuery> = {
  /**
   * Input is `unknown` rather than the parsed type: request schemas coerce and
   * default, so what arrives on the wire is not the shape handlers receive.
   * `z.ZodType<T>` would pin both sides to `T` and make every `.default()`
   * field optional in the handler.
   */
  body?: z.ZodType<TBody, z.ZodTypeDef, unknown>;
  query?: z.ZodType<TQuery, z.ZodTypeDef, unknown>;
  /** Set false for public routes such as health checks and webhooks. */
  auth?: boolean;
};

/**
 * Wraps a route handler with: request id, auth, Zod parsing of body + query,
 * uniform error shaping and access logging. Handlers stay free of boilerplate
 * and can throw AppError anywhere.
 */
export function route<TBody = undefined, TQuery = undefined, P = Record<string, string>>(
  opts: Options<TBody, TQuery>,
  handler: (args: HandlerArgs<TBody, TQuery, P>) => Promise<Response>,
) {
  /**
   * `ctx` is required, not optional. Next generates a type check per route that
   * compares the second parameter against its own RouteContext, and an optional
   * parameter widens it to `RouteContext | undefined`, which fails the check at
   * build time even though it is fine at runtime. The optional chaining below
   * keeps static routes safe if the context is ever absent.
   */
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = Date.now();

    try {
      const user = opts.auth === false ? ({} as SessionUser) : await requireUser();

      let body = undefined as TBody;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw badRequest("Send a JSON body.");
        }
        body = opts.body.parse(raw);
      }

      let query = undefined as TQuery;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      }

      const params = ((await ctx?.params) ?? ({} as P)) as P;
      const res = await handler({ req, user, body, query, params, requestId });
      res.headers.set("X-Request-Id", requestId);

      logger.info("request", {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        status: res.status,
        ms: Date.now() - started,
      });
      return res;
    } catch (err) {
      return fail(err, requestId);
    }
  };
}
