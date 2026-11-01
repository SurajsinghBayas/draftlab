import { z } from "zod";
import { judgeJson } from "../llm";
import { clamp, fleschReadingEase, lintMechanics, quoteExists, sentences, stripMarkdown, wordCount } from "../text";
import type { Finding, MetricResult } from "../types";

const Schema = z.object({
  errors: z.array(z.object({ quote: z.string(), type: z.string(), fix: z.string() })),
});

/** Each error per 100 words costs this many points, so 5 errors per 100 words scores 0. */
const POINTS_PER_ERROR_RATE = 20;

export function grammarScore(errorCount: number, wordTotal: number): number {
  return clamp(100 - (errorCount / Math.max(wordTotal, 1)) * 100 * POINTS_PER_ERROR_RATE);
}

export async function evaluateGrammar(draft: string): Promise<Omit<MetricResult, "ms">> {
  const totalWords = wordCount(draft);
  const lint = lintMechanics(draft);
  const judged = await judgeJson(
    Schema,
    `List every objective error of grammar, spelling, or punctuation in the draft.
Report errors only. Do not report style preferences, word choice, Markdown syntax, or bracketed placeholders.
"quote" must be copied exactly from the draft and be as short as possible while still showing the error.

<draft>
${draft}
</draft>

Return {"errors":[{"quote":"...","type":"grammar|spelling|punctuation","fix":"..."}]}. Return an empty list if there are none.`,
  );

  // A reported error only counts if its quote is really in the draft. Models invent these.
  const verified = judged.errors.filter((e) => quoteExists(e.quote, draft));
  const invented = judged.errors.length - verified.length;
  const lintOnly = lint.filter((l) => !verified.some((e) => quoteExists(l.text, e.quote)));
  const count = verified.length + lintOnly.length;
  const score = grammarScore(count, totalWords);

  const sents = sentences(draft);
  const avg = sents.length ? stripMarkdown(draft).split(/\s+/).length / sents.length : 0;
  const flesch = fleschReadingEase(draft);

  const findings: Finding[] = [
    ...verified.map((e) => ({
      severity: "medium" as const,
      text: `${e.type}: “${e.quote}”`,
      detail: `Suggested: ${e.fix}`,
    })),
    ...lintOnly.map((l) => ({ severity: "medium" as const, text: `${l.rule}: “${l.text}”` })),
  ];

  return {
    key: "grammar",
    score,
    summary: count === 0 ? "No objective errors found." : `${count} error${count === 1 ? "" : "s"} in ${totalWords} words.`,
    signals: [
      { label: "Errors, reviewer (quote verified)", value: String(verified.length), kind: "judged" },
      { label: "Errors, mechanical lint", value: String(lintOnly.length), kind: "measured" },
      { label: "Reviewer quotes rejected", value: String(invented), kind: "measured" },
      { label: "Average sentence length", value: `${avg.toFixed(1)} words`, kind: "measured" },
      { label: "Flesch reading ease", value: flesch === null ? "n/a" : flesch.toFixed(0), kind: "measured" },
    ],
    findings,
  };
}
