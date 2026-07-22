import type { FitReport } from "@/types/domain";
import { toMarkdown } from "./markdown";
import { toCsv } from "./csv";
import { toPdf } from "./pdf";
import { slugify } from "@/lib/utils";

export type ExportFormat = "pdf" | "markdown" | "json" | "csv";

export type ExportPayload = {
  body: Uint8Array | string;
  contentType: string;
  filename: string;
};

export async function buildExport(
  format: ExportFormat,
  args: { report: FitReport; url: string; title: string; createdAt: Date },
): Promise<ExportPayload> {
  const stem = `${slugify(args.title)}-fit-report`;

  switch (format) {
    case "pdf":
      return { body: await toPdf(args), contentType: "application/pdf", filename: `${stem}.pdf` };
    case "markdown":
      return { body: toMarkdown(args), contentType: "text/markdown; charset=utf-8", filename: `${stem}.md` };
    case "csv":
      return { body: toCsv(args), contentType: "text/csv; charset=utf-8", filename: `${stem}.csv` };
    case "json":
      return {
        body: JSON.stringify({ url: args.url, title: args.title, analysedAt: args.createdAt.toISOString(), report: args.report }, null, 2),
        contentType: "application/json; charset=utf-8",
        filename: `${stem}.json`,
      };
  }
}

export { toMarkdown, toCsv, toPdf };
