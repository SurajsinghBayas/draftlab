/** Deterministic text measures. No model calls, so these are stable and unit-tested. */

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)[*_](\S)/g, "$1$2")
    .replace(/(\S)[*_](?=\s|$|[.,;:!?])/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|?[-:\s|]+\|?\s*$/gm, " ")
    .replace(/\|/g, " ");
}

export function words(text: string): string[] {
  return (stripMarkdown(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’.,-]*/gu) ?? []).map((w) =>
    w.replace(/[.,'’-]+$/, ""),
  );
}

export const wordCount = (text: string) => words(text).length;

export function sentences(text: string): string[] {
  return stripMarkdown(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"“\[])/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}]/u.test(s));
}

/** Body paragraphs: blocks of prose, without headings or subject lines. */
export function paragraphs(md: string): string[] {
  return md
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, "\n")
    .replace(/^\W*subject\s*:.*$/gim, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && wordCount(b) >= 8);
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch Reading Ease: higher is easier. 60-70 is plain English, below 30 is academic. */
export function fleschReadingEase(text: string): number | null {
  const w = words(text);
  const s = sentences(text);
  if (w.length < 20 || s.length === 0) return null;
  const syl = w.reduce((n, x) => n + syllables(x), 0);
  return 206.835 - 1.015 * (w.length / s.length) - 84.6 * (syl / w.length);
}

const normalizeForMatch = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** True if a model's quote really occurs in the source. This catches invented evidence. */
export function quoteExists(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote).replace(/^["']|["'.,;:]$/g, "");
  return q.length > 0 && normalizeForMatch(source).includes(q);
}

const matchTokens = (text: string) => normalizeForMatch(text).match(/[\p{L}\p{N}']+/gu) ?? [];

function gramSet(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(" "));
  return out;
}

/**
 * Share of the draft's word n-grams that occur verbatim in the corpus, and the longest copied run.
 * Word 6-grams rarely match by chance in ordinary prose, so a hit suggests copying.
 * `exclude` holds text the draft is allowed to repeat, such as the user's own facts.
 */
export function verbatimOverlap(draft: string, corpus: string, exclude = "", n = 6) {
  const tokens = matchTokens(stripMarkdown(draft));
  const corpusGrams = gramSet(matchTokens(corpus), n);
  const excluded = gramSet(matchTokens(exclude), n);
  let matched = 0;
  let total = 0;
  let run = 0;
  let longest = 0;
  let longestEnd = 0;
  for (let i = 0; i + n <= tokens.length; i++) {
    const gram = tokens.slice(i, i + n).join(" ");
    if (excluded.has(gram)) {
      run = 0;
      continue;
    }
    total++;
    if (corpusGrams.has(gram)) {
      matched++;
      run++;
      if (run > longest) {
        longest = run;
        longestEnd = i + n;
      }
    } else {
      run = 0;
    }
  }
  const longestWords = longest ? longest + n - 1 : 0;
  return {
    containment: total ? matched / total : 0,
    longestWords,
    longestRun: longest ? tokens.slice(longestEnd - longestWords, longestEnd).join(" ") : "",
  };
}

/** Figures as normalized strings: "1,200" becomes "1200". Bracketed placeholders are ignored. */
export function extractFigures(text: string): string[] {
  const clean = stripMarkdown(text).replace(/\[[^\]]*\]/g, " ");
  const found = clean.match(/(?<![\p{L}\d])\d[\d,]*(?:\.\d+)?/gu) ?? [];
  return [...new Set(found.map((f) => f.replace(/,/g, "").replace(/\.$/, "")))];
}

export const placeholders = (text: string) => text.match(/\[[^\]\n]{2,80}\](?!\()/g) ?? [];

const STOCK_PHRASES = [
  "in today's fast-paced",
  "in today's world",
  "in the ever-evolving",
  "ever-changing landscape",
  "rapidly evolving",
  "delve into",
  "delves into",
  "it is important to note",
  "it's important to note",
  "it is worth noting",
  "plays a crucial role",
  "plays a vital role",
  "a testament to",
  "game-changer",
  "game changer",
  "navigating the",
  "unlock the potential",
  "harness the power",
  "at the end of the day",
  "i hope this email finds you well",
  "tapestry",
  "in conclusion",
];

export function stockPhrases(text: string): string[] {
  const t = normalizeForMatch(text);
  return STOCK_PHRASES.filter((p) => t.includes(p));
}

export interface LintIssue {
  rule: string;
  text: string;
}

/** Mechanical errors a regex can find with no false-positive-prone judgement involved. */
export function lintMechanics(md: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const text = stripMarkdown(md);
  for (const m of text.matchAll(/\b([\p{L}]+)\s+\1\b/giu)) {
    if (!["that", "had"].includes(m[1].toLowerCase())) issues.push({ rule: "Repeated word", text: m[0] });
  }
  for (const m of text.matchAll(/[\p{L}][,;](?=\p{L})/gu)) issues.push({ rule: "Missing space after punctuation", text: m[0] });
  for (const m of text.matchAll(/\s[,;.!?](?=\s|$)/gu)) issues.push({ rule: "Space before punctuation", text: m[0].trim() });
  for (const m of text.matchAll(/\b[aA]\s+(?:[aeio][a-z]{2,})\b/g)) {
    if (!/^a\s+(one|once|eu|use)/i.test(m[0])) issues.push({ rule: "'a' before a vowel sound", text: m[0] });
  }
  return issues;
}

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** 100 inside the tolerance band, falling linearly to 0 at 60% off target. */
export function lengthScore(actual: number, target: number, tolerance = 0.15): number {
  const off = Math.abs(actual - target) / target;
  if (off <= tolerance) return 100;
  return clamp(100 * (1 - (off - tolerance) / (0.6 - tolerance)));
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
