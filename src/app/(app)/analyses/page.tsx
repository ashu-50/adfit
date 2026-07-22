import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AnalysisList } from "@/components/analysis/analysis-list";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Analyses" };

export default function AnalysesPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
      <PageHeader
        eyebrow="History"
        title="Analyses"
        description="Search everything you have run, sorted however you need it."
        actions={
          <Button asChild>
            <Link href="/new">
              <Plus />
              New analysis
            </Link>
          </Button>
        }
      />
      <AnalysisList pageSize={25} />
    </div>
  );
}
