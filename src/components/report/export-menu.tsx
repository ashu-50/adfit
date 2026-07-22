"use client";

import { Download, FileJson, FileSpreadsheet, FileText, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUsage } from "@/hooks/use-usage";
import type { ExportFormat } from "@/types/api";

const FORMATS: { id: ExportFormat; label: string; icon: typeof FileText; hint: string }[] = [
  { id: "pdf", label: "PDF", icon: FileText, hint: "For sending on" },
  { id: "markdown", label: "Markdown", icon: FileText, hint: "For your docs" },
  { id: "csv", label: "CSV", icon: FileSpreadsheet, hint: "One row per finding" },
  { id: "json", label: "JSON", icon: FileJson, hint: "The whole report" },
];

export function ExportMenu({ analysisId }: { analysisId: string }) {
  const { data } = useUsage();
  const allowed = new Set(data?.plan.limits.exportFormats ?? ["markdown", "json"]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Download report</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {FORMATS.map(({ id, label, icon: Icon, hint }) => {
            const locked = !allowed.has(id);
            return (
              <DropdownMenuItem
                key={id}
                onSelect={(event) => {
                  if (locked) {
                    event.preventDefault();
                    toast.info(`${label} export is on Pro and above.`);
                    return;
                  }
                  // Plain navigation: the route answers with a file download, so
                  // fetching it into memory first would only add a step.
                  window.location.href = `/api/analyses/${analysisId}/export?format=${id}`;
                }}
              >
                {locked ? <Lock /> : <Icon />}
                <span className="flex flex-1 items-center justify-between gap-3">
                  {label}
                  <span className="font-mono text-[10px] text-muted-foreground">{locked ? "Pro" : hint}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
