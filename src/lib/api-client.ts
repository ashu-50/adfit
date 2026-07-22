import type { ApiEnvelope, ApiError, PaginationMeta } from "@/types/api";

/**
 * Thin typed wrapper over fetch. Every route answers in the same envelope, so
 * unwrapping and error shaping belong in one place rather than in each hook.
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "ApiRequestError";
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: PaginationMeta }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let payload: ApiEnvelope<T>;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiRequestError({ code: "INTERNAL", message: "The server returned an unreadable response." }, res.status);
  }

  if (!payload.ok) throw new ApiRequestError(payload.error, res.status);
  return { data: payload.data, meta: payload.meta };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Serialises a filter object into a query string, dropping empty values. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
