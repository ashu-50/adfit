import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectManager } from "@/components/projects/project-manager";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <PageHeader
        eyebrow="Organise"
        title="Projects"
        description="Group analyses by funnel, campaign or client."
      />
      <ProjectManager />
    </div>
  );
}
