import type { CheerioAPI } from "cheerio";
import type { FaqEntry, FormSummary, ProductSection } from "../types";
import { text, uniqueBy } from "./shared";
import { normalizeText, truncate } from "@/lib/utils";

const QUESTION_PATTERN = /\?\s*$/;
const FAQ_HINT = /faq|frequently asked|questions|common questions/i;

export function detectFaq($: CheerioAPI): FaqEntry[] {
  const entries: FaqEntry[] = [];

  // 1. schema.org FAQPage is authoritative when present.
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const raw = JSON.parse($(el).text()) as unknown;
      const nodes = Array.isArray(raw) ? raw : [raw];
      for (const node of nodes) {
        const graph = (node as { "@graph"?: unknown[] })["@graph"] ?? [node];
        for (const item of graph as { "@type"?: string; mainEntity?: unknown }[]) {
          if (item["@type"] !== "FAQPage") continue;
          const questions = (item.mainEntity ?? []) as { name?: string; acceptedAnswer?: { text?: string } }[];
          for (const q of questions) {
            if (q.name && q.acceptedAnswer?.text) {
              entries.push({
                question: truncate(normalizeText(q.name), 300),
                answer: truncate(normalizeText(q.acceptedAnswer.text.replace(/<[^>]+>/g, " ")), 1200),
              });
            }
          }
        }
      }
    } catch {
      // Malformed JSON-LD is common; ignore and fall through.
    }
  });

  // 2. Native disclosure markup.
  if (entries.length === 0) {
    $("details").each((_, el) => {
      const question = normalizeText($(el).find("summary").first().text());
      const clone = $(el).clone();
      clone.find("summary").remove();
      const answer = normalizeText(clone.text());
      if (question && answer) entries.push({ question: truncate(question, 300), answer: truncate(answer, 1200) });
    });
  }

  // 3. Accordion patterns: a heading that ends in "?" plus its next sibling.
  if (entries.length === 0) {
    $("h2, h3, h4, dt, [class*='question' i], [role='button']").each((_, el) => {
      if (entries.length >= 15) return;
      const question = normalizeText($(el).text());
      if (!question || !QUESTION_PATTERN.test(question) || question.length > 250) return;

      const answerNode = $(el).next("p, div, dd, [class*='answer' i]");
      const answer = answerNode.length > 0 ? text($, answerNode.get(0), 1200) : text($, $(el).parent().find("p").first().get(0), 1200);
      if (answer && answer.length > 15) entries.push({ question: truncate(question, 300), answer: truncate(answer, 1200) });
    });
  }

  // 4. Last resort: any question-shaped line inside an explicit FAQ section.
  if (entries.length === 0) {
    $("section, div").each((_, el) => {
      if (entries.length >= 10) return;
      const heading = normalizeText($(el).find("h2, h3").first().text());
      if (!FAQ_HINT.test(heading)) return;
      $(el).find("p, li").each((_, p) => {
        const value = normalizeText($(p).text());
        if (QUESTION_PATTERN.test(value) && value.length < 250 && entries.length < 10) {
          const answer = text($, $(p).next().get(0), 800);
          if (answer) entries.push({ question: value, answer });
        }
      });
    });
  }

  return uniqueBy(entries, (e) => e.question).slice(0, 15);
}

export function detectForms($: CheerioAPI): FormSummary[] {
  const forms: FormSummary[] = [];

  $("form").each((_, el) => {
    if (forms.length >= 6) return;
    const node = $(el);
    const fields: string[] = [];

    node.find("input, select, textarea").each((_, field) => {
      const f = $(field);
      const type = (f.attr("type") ?? "text").toLowerCase();
      if (["hidden", "submit", "button", "image"].includes(type)) return;
      const name =
        f.attr("name") ??
        f.attr("placeholder") ??
        f.attr("aria-label") ??
        normalizeText(node.find(`label[for='${f.attr("id") ?? ""}']`).text()) ??
        type;
      if (name) fields.push(normalizeText(String(name)).slice(0, 40));
    });

    if (fields.length === 0) return;

    const submitLabel =
      normalizeText(node.find("button[type='submit'], input[type='submit'], button:not([type])").first().text()) ||
      node.find("input[type='submit']").attr("value") ||
      null;

    forms.push({ fieldCount: fields.length, fields: fields.slice(0, 12), submitLabel: submitLabel || null, action: node.attr("action") ?? null });
  });

  // Formless capture (React-controlled inputs) is extremely common on modern LPs.
  if (forms.length === 0) {
    const loose = $("input[type='email'], input[name*='email' i]");
    if (loose.length > 0) {
      forms.push({ fieldCount: loose.length, fields: ["email"], submitLabel: null, action: null });
    }
  }

  return forms;
}

export function detectProductSections($: CheerioAPI): ProductSection[] {
  const sections: ProductSection[] = [];

  $("section, article, [class*='feature' i], [class*='benefit' i], [class*='product' i]").each((_, el) => {
    if (sections.length >= 12) return;
    const node = $(el);
    if (node.parents("section, article").length > 1) return;

    const heading = normalizeText(node.find("h2, h3").first().text());
    if (!heading || heading.length > 160) return;

    const body = text($, el, 900);
    if (body.length < 60) return;

    sections.push({ heading, text: truncate(body, 800), hasImage: node.find("img, svg, video, picture").length > 0 });
  });

  return uniqueBy(sections, (s) => s.heading);
}

export function detectNavigation($: CheerioAPI): string[] {
  const items: string[] = [];
  $("header nav a, nav a, [role='navigation'] a").each((_, el) => {
    const label = normalizeText($(el).text());
    if (label && label.length <= 40 && items.length < 24) items.push(label);
  });
  return [...new Set(items)];
}
