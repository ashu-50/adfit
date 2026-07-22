import { createSupabaseAdminClient } from "@/lib/auth/supabase";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/http/errors";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Screenshots go straight from the browser to Supabase Storage via a signed
 * URL, never through a route handler. Uploading a 10 MB PNG through a serverless
 * function wastes the function's body limit and its execution time for no gain.
 */
export async function createSignedUpload(args: { userId: string; fileName: string; mimeType: string }) {
  if (!ALLOWED_MIME.has(args.mimeType)) {
    throw new AppError("BAD_REQUEST", "Upload a PNG, JPEG, WebP or GIF.");
  }

  const extension = args.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "png";
  const path = `${args.userId}/${crypto.randomUUID()}.${extension}`;

  const bucket = serverEnv().SUPABASE_STORAGE_BUCKET;

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new AppError("INTERNAL", "We could not prepare the upload. Try again.", { cause: error });
  }

  // The bucket travels with the token. The client used to read it from a
  // separate NEXT_PUBLIC_ variable, so setting one name and not the other
  // produced a token signed for one bucket being uploaded to another — which
  // Supabase rejects with a message that never mentions configuration.
  return { path, signedUrl: data.signedUrl, token: data.token, bucket };
}

export async function downloadScreenshot(path: string): Promise<{ base64: string; mimeType: string }> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(serverEnv().SUPABASE_STORAGE_BUCKET)
    .download(path);

  if (error || !data) {
    throw new AppError("NOT_FOUND", "That screenshot is no longer available. Upload it again.", { cause: error });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new AppError("BAD_REQUEST", "That screenshot is larger than 10 MB.");
  }

  return { base64: buffer.toString("base64"), mimeType: data.type || "image/png" };
}

export async function createSignedDownload(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .storage.from(serverEnv().SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

/** Called when an analysis is deleted so orphaned screenshots do not accumulate. */
export async function deleteScreenshots(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await createSupabaseAdminClient().storage.from(serverEnv().SUPABASE_STORAGE_BUCKET).remove(paths);
}
