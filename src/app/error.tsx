"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="label-mono text-destructive">Error</p>
      <h1 className="text-3xl font-semibold tracking-tight">Something broke on our side</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page could not finish loading. Trying again often clears it; if it does not, the reference below helps us
        find it.
      </p>
      {error.digest ? <code className="font-mono text-xs text-muted-foreground">{error.digest}</code> : null}
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
