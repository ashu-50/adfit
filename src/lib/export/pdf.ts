import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DIMENSION_LABELS, type FitReport } from "@/types/domain";

/**
 * pdf-lib rather than Puppeteer-to-PDF.
 *
 * Rendering HTML to PDF would mean a second Chromium round trip per export, for
 * a document that is fundamentally a scored list. pdf-lib draws it directly in
 * ~200ms inside the same function, with no binary dependency and no cold start.
 * The trade-off is manual layout, which is why the flow helpers below exist.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const CONTENT_WIDTH = A4.width - MARGIN * 2;

const INK = rgb(0.07, 0.08, 0.11);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.88, 0.89, 0.91);
const GOOD = rgb(0.09, 0.55, 0.35);
const WARN = rgb(0.72, 0.5, 0.05);
const BAD = rgb(0.75, 0.18, 0.18);

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pageNumber: number;
};

function toneFor(score: number) {
  return score >= 75 ? GOOD : score >= 50 ? WARN : BAD;
}

/** pdf-lib's StandardFonts are WinAnsi only; anything else throws on draw. */
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word longer than the column: hard-break it rather than overflow.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let remainder = word;
      while (font.widthOfTextAtSize(remainder, size) > maxWidth && remainder.length > 1) {
        let cut = remainder.length;
        while (cut > 1 && font.widthOfTextAtSize(remainder.slice(0, cut), size) > maxWidth) cut--;
        lines.push(remainder.slice(0, cut));
        remainder = remainder.slice(cut);
      }
      line = remainder;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.pageNumber++;
  ctx.y = A4.height - MARGIN;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 30) newPage(ctx);
}

function text(ctx: Ctx, value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; leading?: number; gap?: number } = {}): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? ctx.bold : ctx.regular;
  const indent = opts.indent ?? 0;
  const leading = opts.leading ?? size * 1.45;
  const lines = wrap(value, font, size, CONTENT_WIDTH - indent);

  for (const line of lines) {
    ensure(ctx, leading);
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y - size, size, font, color: opts.color ?? INK });
    ctx.y -= leading;
  }
  ctx.y -= opts.gap ?? 0;
}

function rule(ctx: Ctx, gap = 10): void {
  ensure(ctx, gap + 2);
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: A4.width - MARGIN, y: ctx.y }, thickness: 0.7, color: RULE });
  ctx.y -= gap;
}

function scoreBar(ctx: Ctx, label: string, score: number, weight: number, applicable: boolean): void {
  ensure(ctx, 26);
  const barX = MARGIN + 210;
  const barWidth = CONTENT_WIDTH - 210 - 70;

  ctx.page.drawText(sanitize(label), { x: MARGIN, y: ctx.y - 9, size: 9.5, font: ctx.regular, color: INK });

  if (!applicable) {
    ctx.page.drawText("not applicable", { x: barX, y: ctx.y - 9, size: 9, font: ctx.regular, color: MUTED });
    ctx.y -= 20;
    return;
  }

  ctx.page.drawRectangle({ x: barX, y: ctx.y - 11, width: barWidth, height: 7, color: rgb(0.93, 0.94, 0.95) });
  ctx.page.drawRectangle({ x: barX, y: ctx.y - 11, width: (barWidth * score) / 100, height: 7, color: toneFor(score) });
  ctx.page.drawText(`${score}`, { x: barX + barWidth + 12, y: ctx.y - 10, size: 9.5, font: ctx.bold, color: INK });
  ctx.page.drawText(`${Math.round(weight * 100)}%`, { x: barX + barWidth + 40, y: ctx.y - 10, size: 8.5, font: ctx.regular, color: MUTED });
  ctx.y -= 20;
}

export async function toPdf(args: { report: FitReport; url: string; title: string; createdAt: Date }): Promise<Uint8Array> {
  const { report } = args;

  const doc = await PDFDocument.create();
  doc.setTitle(`${args.title} — ad to landing page fit`);
  doc.setProducer("Ad-to-Landing Page Fit Analyzer");
  doc.setCreationDate(args.createdAt);

  const ctx: Ctx = {
    doc,
    page: doc.addPage([A4.width, A4.height]),
    y: A4.height - MARGIN,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    pageNumber: 1,
  };

  // Cover block
  ctx.page.drawRectangle({ x: 0, y: A4.height - 150, width: A4.width, height: 150, color: rgb(0.055, 0.06, 0.09) });
  ctx.page.drawText("AD TO LANDING PAGE FIT", { x: MARGIN, y: A4.height - 58, size: 9, font: ctx.bold, color: rgb(0.6, 0.62, 0.72) });
  for (const [i, line] of wrap(args.title, ctx.bold, 21, CONTENT_WIDTH - 110).slice(0, 2).entries()) {
    ctx.page.drawText(line, { x: MARGIN, y: A4.height - 84 - i * 25, size: 21, font: ctx.bold, color: rgb(1, 1, 1) });
  }
  ctx.page.drawText(sanitize(args.url).slice(0, 78), { x: MARGIN, y: A4.height - 132, size: 9.5, font: ctx.regular, color: rgb(0.65, 0.67, 0.76) });

  ctx.page.drawText(`${report.overallScore}`, { x: A4.width - MARGIN - 74, y: A4.height - 100, size: 46, font: ctx.bold, color: rgb(1, 1, 1) });
  ctx.page.drawText(`grade ${report.grade}`, { x: A4.width - MARGIN - 74, y: A4.height - 122, size: 9.5, font: ctx.regular, color: rgb(0.65, 0.67, 0.76) });

  ctx.y = A4.height - 180;

  text(ctx, report.verdict, { size: 13, bold: true, gap: 8 });
  text(ctx, report.summary, { size: 10.5, color: MUTED, gap: 6 });
  text(ctx, `Analysed ${args.createdAt.toDateString()} · confidence ${Math.round(report.confidence * 100)}%`, { size: 8.5, color: MUTED, gap: 12 });
  rule(ctx, 16);

  text(ctx, "Scores by dimension", { size: 13, bold: true, gap: 10 });
  for (const dimension of report.dimensions) {
    scoreBar(ctx, DIMENSION_LABELS[dimension.dimension], dimension.score, dimension.weight, dimension.applicable);
  }
  ctx.y -= 8;

  if (report.criticalIssues.length > 0) {
    rule(ctx, 16);
    text(ctx, "Fix these first", { size: 13, bold: true, gap: 10 });
    for (const issue of report.criticalIssues) {
      ensure(ctx, 60);
      text(ctx, `${issue.severity} · ${issue.title}`, { size: 10.5, bold: true, color: issue.severity === "CRITICAL" ? BAD : WARN, gap: 3 });
      text(ctx, issue.detail, { size: 9.5, color: MUTED, indent: 10, gap: 3 });
      if (issue.evidence?.adQuote) text(ctx, `Ad: "${issue.evidence.adQuote}"`, { size: 9, color: MUTED, indent: 10 });
      if (issue.evidence?.pageQuote) text(ctx, `Page: "${issue.evidence.pageQuote}"`, { size: 9, color: MUTED, indent: 10 });
      ctx.y -= 8;
    }
  }

  if (report.quickWins.length > 0) {
    rule(ctx, 16);
    text(ctx, "Quick wins", { size: 13, bold: true, gap: 10 });
    for (const win of report.quickWins) {
      ensure(ctx, 40);
      text(ctx, `${win.title}`, { size: 10.5, bold: true, gap: 2 });
      text(ctx, `${win.effort.toLowerCase()} effort · impact ${win.impact}/10 — ${win.detail}`, { size: 9.5, color: MUTED, indent: 10, gap: 6 });
    }
  }

  newPage(ctx);
  text(ctx, "Detailed findings", { size: 15, bold: true, gap: 12 });

  for (const dimension of report.dimensions) {
    if (!dimension.applicable) continue;
    ensure(ctx, 70);
    text(ctx, `${DIMENSION_LABELS[dimension.dimension]} — ${dimension.score}/100`, { size: 12, bold: true, color: toneFor(dimension.score), gap: 4 });
    text(ctx, dimension.summary, { size: 9.5, color: MUTED, gap: 6 });

    for (const problem of dimension.problems) {
      text(ctx, `• ${problem.title} (${problem.severity.toLowerCase()})`, { size: 9.5, bold: true, indent: 8, gap: 2 });
      text(ctx, problem.detail, { size: 9, color: MUTED, indent: 18, gap: 4 });
    }
    for (const rec of dimension.recommendations) {
      text(ctx, `→ ${rec.title}`, { size: 9.5, bold: true, indent: 8, gap: 2 });
      text(ctx, `${rec.priority.toLowerCase()} priority, ${rec.effort.toLowerCase()} effort. ${rec.detail}`, { size: 9, color: MUTED, indent: 18, gap: 2 });
      if (rec.example) text(ctx, `Example: ${rec.example}`, { size: 9, color: MUTED, indent: 18, gap: 4 });
    }
    ctx.y -= 10;
    rule(ctx, 12);
  }

  if (report.clusters.length > 1) {
    newPage(ctx);
    text(ctx, "Ad angles and page blueprints", { size: 15, bold: true, gap: 12 });
    for (const cluster of report.clusters) {
      ensure(ctx, 90);
      text(ctx, cluster.label, { size: 12, bold: true, gap: 2 });
      text(ctx, cluster.rationale, { size: 9.5, color: MUTED, gap: 6 });
      text(ctx, `Headline: ${cluster.blueprint.headline}`, { size: 9.5, indent: 8, gap: 2 });
      text(ctx, `Subheadline: ${cluster.blueprint.subheadline}`, { size: 9.5, indent: 8, gap: 2 });
      text(ctx, `CTA: ${cluster.blueprint.cta}`, { size: 9.5, indent: 8, gap: 4 });
      for (const benefit of cluster.blueprint.benefits) text(ctx, `• ${benefit}`, { size: 9, color: MUTED, indent: 16 });
      ctx.y -= 10;
      rule(ctx, 12);
    }
  }

  // Footers last, so every page exists before it is numbered.
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText(`${index + 1} / ${pages.length}`, {
      x: A4.width - MARGIN - 26, y: MARGIN - 22, size: 8, font: ctx.regular, color: MUTED,
    });
    if (index > 0) {
      page.drawText(sanitize(args.title).slice(0, 60), { x: MARGIN, y: MARGIN - 22, size: 8, font: ctx.regular, color: MUTED });
    }
  });

  return doc.save();
}
