import type { Metadata } from "next";
import { AnalysisView } from "@/components/report/analysis-view";

export const metadata: Metadata = { title: "Report" };

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-4xl">
      <AnalysisView analysisId={id} />
    </div>
  );
}
