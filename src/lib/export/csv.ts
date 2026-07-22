import { DIMENSION_LABELS, type FitReport } from "@/types/domain";

/** RFC 4180 escaping. Excel chokes on anything looser. */
function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rows(data: unknown[][]): string {
  return data.map((row) => row.map(cell).join(",")).join("\r\n");
}

/**
 * One row per finding rather than one row per report, because the whole point of
 * CSV export is pivoting findings in a spreadsheet. The report-level fields are
 * repeated on each row so a filter never loses context.
 */
export function toCsv(args: { report: FitReport; url: string; title: string; createdAt: Date }): string {
  const { report } = args;
  const shared = [args.title, args.url, args.createdAt.toISOString(), report.overallScore, report.grade];

  const header = [
    "analysis", "url", "analysed_at", "overall_score", "grade",
    "dimension", "dimension_score", "dimension_weight", "applicable",
    "type", "severity_or_priority", "effort", "impact", "finding", "detail", "ad_quote", "page_quote", "selector",
  ];

  const data: unknown[][] = [header];

  for (const dimension of report.dimensions) {
    const dims = [
      DIMENSION_LABELS[dimension.dimension],
      dimension.applicable ? dimension.score : "",
      dimension.applicable ? dimension.weight : "",
      dimension.applicable,
    ];

    if (dimension.problems.length === 0 && dimension.recommendations.length === 0) {
      data.push([...shared, ...dims, "summary", "", "", "", dimension.summary, "", "", "", ""]);
      continue;
    }

    for (const problem of dimension.problems) {
      data.push([
        ...shared, ...dims, "problem", problem.severity, "", "",
        problem.title, problem.detail,
        problem.evidence?.adQuote ?? "", problem.evidence?.pageQuote ?? "", problem.evidence?.selector ?? "",
      ]);
    }
    for (const rec of dimension.recommendations) {
      data.push([
        ...shared, ...dims, "recommendation", rec.priority, rec.effort, rec.impact,
        rec.title, rec.detail, "", "", "",
      ]);
    }
  }

  // BOM so Excel opens UTF-8 correctly on Windows.
  return "\uFEFF" + rows(data);
}
