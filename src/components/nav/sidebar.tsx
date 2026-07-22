"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, FolderKanban, LayoutDashboard, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyses", label: "Analyses", icon: BarChart3 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings/billing", label: "Settings", icon: Settings },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* One pill that slides between items rather than four that fade,
                so the eye tracks where it went instead of where it appeared. */}
            {active ? (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-md bg-accent"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <Icon className="relative size-4 shrink-0" aria-hidden />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function NewAnalysisButton({ className }: { className?: string }) {
  return (
    <Button asChild size="sm" className={cn("w-full", className)}>
      <Link href="/new">
        <Plus />
        New analysis
      </Link>
    </Button>
  );
}
