import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { BillingPanel } from "@/components/billing/billing-panel";

export const metadata: Metadata = { title: "Plan and usage" };

export default function BillingPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <PageHeader eyebrow="Settings" title="Plan and usage" description="What you are on, and what you have used." />
      <BillingPanel />
    </div>
  );
}
