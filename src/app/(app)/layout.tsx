import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { NewAnalysisButton, SidebarNav } from "@/components/nav/sidebar";
import { UserMenu } from "@/components/nav/user-menu";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import { UsageMeter } from "@/components/shared/usage-meter";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // Middleware already guards these paths; this is the backstop that also gives
  // the layout a non-null user without a cast.
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border p-4 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1 font-mono text-sm font-semibold tracking-tight">
          <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
          adfit
        </Link>

        <NewAnalysisButton />
        <SidebarNav />

        <div className="mt-auto flex flex-col gap-3">
          <UsageMeter />
          <UserMenu email={user.email} fullName={user.fullName} avatarUrl={user.avatarUrl} plan={user.plan} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur lg:justify-end lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-mono text-sm font-semibold lg:hidden">
            <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
            adfit
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        {/* Mobile navigation. The sidebar is hidden below lg. */}
        <nav className="sticky bottom-0 z-30 border-t border-border bg-background/95 p-2 backdrop-blur lg:hidden">
          <SidebarNav />
        </nav>
      </div>
    </div>
  );
}
