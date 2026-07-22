import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NewAnalysisForm } from "@/components/analysis/new-analysis-form";

export const metadata: Metadata = { title: "New analysis" };

export default function NewAnalysisPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <PageHeader
        eyebrow="New analysis"
        title="Check a funnel"
        description="Give us the ads and the page they point at. The report takes about thirty seconds."
      />
      <NewAnalysisForm />
    </div>
  );
}
