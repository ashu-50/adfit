import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border/60">
        <div className="container flex h-14 items-center">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
            <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
            adfit
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
