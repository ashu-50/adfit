"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { clientEnv } from "@/lib/env";
import type { SignedUpload } from "@/types/api";

export type UploadedScreenshot = {
  storagePath: string;
  mimeType: string;
  fileSize: number;
  previewUrl: string;
  fileName: string;
};

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Uploads go straight from the browser to Supabase Storage using a short-lived
 * signed URL minted by the API. Routing image bytes through a Next.js route
 * handler would burn function memory and time on a pure passthrough.
 */
export function useUpload() {
  const [uploading, setUploading] = useState(false);

  // Object URLs are held by the browser until explicitly released. Without this
  // the preview blobs survive every removed ad and every navigation, which on a
  // page built for dropping six screenshots is a real leak.
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const release = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((u) => u !== url);
  }, []);

  const upload = useCallback(async (file: File): Promise<UploadedScreenshot> => {
    if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
      throw new Error("Screenshots must be PNG, JPEG, WebP or GIF.");
    }
    if (file.size > MAX_BYTES) throw new Error("That image is larger than 10MB.");

    setUploading(true);
    try {
      const { data } = await api.post<SignedUpload>("/api/uploads", {
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });

      const supabase = createSupabaseBrowserClient();

      // Use the bucket the server signed the token for, not a client env var.
      // Those were two separate settings, and when they disagreed Supabase
      // rejected the upload with an error that never mentioned configuration.
      // Older builds may not send it, so fall back rather than crash.
      const bucket = data.bucket || clientEnv.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(data.path, data.token, file);
      if (error) {
        throw new Error(
          `Upload failed: ${error.message}. Check that the "${bucket}" bucket exists in Supabase and is private.`,
        );
      }

      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.push(previewUrl);

      return {
        storagePath: data.path,
        mimeType: file.type,
        fileSize: file.size,
        previewUrl,
        fileName: file.name,
      };
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, release, appUrl: clientEnv.NEXT_PUBLIC_APP_URL };
}
