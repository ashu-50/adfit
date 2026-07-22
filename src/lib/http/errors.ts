export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "UNSUPPORTED_URL"
  | "FETCH_FAILED"
  | "RENDER_FAILED"
  | "EXTRACTION_EMPTY"
  | "AI_UNAVAILABLE"
  | "AI_INVALID_OUTPUT"
  | "TIMEOUT"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 402,
  UNSUPPORTED_URL: 422,
  FETCH_FAILED: 502,
  RENDER_FAILED: 502,
  EXTRACTION_EMPTY: 422,
  AI_UNAVAILABLE: 503,
  AI_INVALID_OUTPUT: 502,
  TIMEOUT: 504,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Whether a caller can usefully try the same request again. */
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, opts?: { details?: unknown; retryable?: boolean; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = opts?.details;
    this.retryable = opts?.retryable ?? ["RATE_LIMITED", "AI_UNAVAILABLE", "TIMEOUT", "FETCH_FAILED", "RENDER_FAILED"].includes(code);
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError("BAD_REQUEST", m, { details });
export const unauthorized = (m = "Sign in to continue.") => new AppError("UNAUTHORIZED", m);
export const forbidden = (m = "You do not have access to this resource.") => new AppError("FORBIDDEN", m);
export const notFound = (m = "Not found.") => new AppError("NOT_FOUND", m);
export const quotaExceeded = (m: string, details?: unknown) => new AppError("QUOTA_EXCEEDED", m, { details });
export const rateLimited = (m: string, retryAfterS: number) =>
  new AppError("RATE_LIMITED", m, { details: { retryAfterS } });

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    return new AppError("TIMEOUT", "The operation took too long and was stopped.", { cause: err });
  }
  return new AppError("INTERNAL", "Something went wrong on our side.", { cause: err });
}
