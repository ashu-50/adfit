import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, toAppError } from "./errors";
import { logger } from "@/lib/logger";

export type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit }) {
  const body: ApiSuccess<T> = { ok: true, data, ...(init?.meta ? { meta: init.meta } : {}) };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export function fail(err: unknown, requestId?: string) {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json<ApiFailure>(
      { ok: false, error: { code: "VALIDATION_FAILED", message: "Check the highlighted fields.", details } },
      { status: 422 },
    );
  }

  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error(appError.message, { code: appError.code, requestId, cause: String(appError.cause ?? "") });
  }

  const headers = new Headers();
  if (appError.code === "RATE_LIMITED") {
    const after = (appError.details as { retryAfterS?: number } | undefined)?.retryAfterS ?? 60;
    headers.set("Retry-After", String(after));
  }
  if (requestId) headers.set("X-Request-Id", requestId);

  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code: appError.code, message: appError.message, details: appError.details } },
    { status: appError.status, headers },
  );
}

export { AppError };
