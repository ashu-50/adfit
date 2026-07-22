import type { CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { normalizeText } from "@/lib/utils";

export const NOISE_SELECTOR =
  "script, style, noscript, template, svg, iframe, [aria-hidden='true'], [hidden], .sr-only, .visually-hidden";

export function text($: CheerioAPI, el: AnyNode | null | undefined, max = 2000): string {
  if (!el) return "";
  const node = $(el).clone();
  node.find(NOISE_SELECTOR).remove();
  return normalizeText(node.text()).slice(0, max);
}

/** A stable-enough selector for pointing a marketer at the right element. */
export function selectorFor($: CheerioAPI, el: AnyNode): string {
  const node = $(el);
  const tag = (node.prop("tagName") ?? "div").toLowerCase();
  const id = node.attr("id");
  if (id) return `${tag}#${id}`;
  const cls = (node.attr("class") ?? "")
    .split(/\s+/)
    .filter((c) => c && !/^(?:[a-z]{1,3}-\d|hover:|md:|lg:|sm:|dark:)/.test(c))
    .slice(0, 2)
    .join(".");
  return cls ? `${tag}.${cls}` : tag;
}

export function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  if (/^(?:javascript|mailto|tel|sms):/i.test(href)) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/**
 * "Above the fold" without a browser. The first ~12% of body elements is a
 * better proxy than pixel height because it survives responsive layouts, and
 * the headless path supplies real geometry when it matters.
 */
export function isAboveFold(domIndex: number, totalElements: number): boolean {
  return domIndex <= Math.max(40, Math.floor(totalElements * 0.12));
}
