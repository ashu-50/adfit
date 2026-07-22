import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/response";
import { uploadRequestSchema } from "@/lib/validation/analysis";
import { createSignedUpload } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/cache/rate-limit";

export const runtime = "nodejs";

export const POST = route({ body: uploadRequestSchema }, async ({ user, body }) => {
  await enforceRateLimit(
    `uploads:${user.id}`,
    { capacity: 60, refillPerSecond: 1 },
    "Too many uploads at once. Wait a moment and retry.",
  );

  const upload = await createSignedUpload({ userId: user.id, fileName: body.fileName, mimeType: body.mimeType });
  return ok(upload, { status: 201 });
});
