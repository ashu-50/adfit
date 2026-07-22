import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="label-mono">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">That page does not exist</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The link may be out of date, or the analysis it pointed at was deleted.
      </p>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}
