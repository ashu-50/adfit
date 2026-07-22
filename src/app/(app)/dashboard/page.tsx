import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCards } from "@/components/shared/stat-cards";
import { AnalysisList } from "@/components/analysis/analysis-list";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getUser();
  const firstName = user?.fullName?.split(" ")[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        eyebrow="Overview"
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Every analysis you have run, and what they say about your funnels."
        actions={
          <Button asChild>
            <Link href="/new">
              New analysis
              <ArrowRight />
            </Link>
          </Button>
        }
      />

      <StatCards />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses">View all</Link>
          </Button>
        </div>
        <AnalysisList compact pageSize={5} />
      </section>
    </div>
  );
}
