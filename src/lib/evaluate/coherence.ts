import { z } from "zod";
import { judgeJson } from "../llm";
import { embed } from "../retrieval";
import { clamp, cosine, paragraphs } from "../text";
import type { Finding, MetricResult, Signal } from "../types";

const CHECKS = {
  through_line: "A single main point or purpose runs through the whole document.",
  logical_order: "Each section or paragraph is in a sensible place. Moving one would not improve the order.",
  transitions: "Consecutive paragraphs connect. A reader never has to guess why the topic changed.",
  no_repetition: "No point is repeated without adding something new.",
  no_contradiction: "No statement conflicts with another statement in the document.",
  ending_follows: "The ending follows from the body and introduces no new unsupported conclusion.",
} as const;
type CheckKey = keyof typeof CHECKS;

const Schema = z.object({
  checks: z.record(z.string(), z.object({ pass: z.boolean(), reason: z.string() })),
});

/** Cosine similarity of neighbouring paragraphs, mapped so 0.25 scores 0 and 0.60 scores 100. */
const flowScore = (meanCosine: number) => clamp(((meanCosine - 0.25) / 0.35) * 100);

export async function evaluateCoherence(draft: string): Promise<Omit<MetricResult, "ms">> {
  const list = Object.entries(CHECKS)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const judged = await judgeJson(
    Schema,
    `Judge each check about the structure of this draft as pass or fail, with a reason of one sentence.

Checks:
${list}

<draft>
${draft}
</draft>

Return {"checks":{"through_line":{"pass":true,"reason":"..."}, ...}} with every check present.`,
  );

  const keys = Object.keys(CHECKS) as CheckKey[];
  const answered = keys.filter((k) => judged.checks[k]);
  if (answered.length === 0) throw new Error("Reviewer answered none of the coherence checks");
  const passed = answered.filter((k) => judged.checks[k].pass);
  const rubric = (passed.length / answered.length) * 100;

  const paras = paragraphs(draft);
  const signals: Signal[] = [{ label: "Structure checks passed", value: `${passed.length} of ${answered.length}`, kind: "judged" }];
  const findings: Finding[] = answered
    .filter((k) => !judged.checks[k].pass)
    .map((k) => ({ severity: "medium" as const, text: CHECKS[k], detail: judged.checks[k].reason }));

  let score = rubric;
  if (paras.length >= 3) {
    // Measured half of the metric. It catches an off-topic paragraph, which a lenient reviewer can miss.
    const vectors = await embed(paras);
    const links = vectors.slice(1).map((v, i) => cosine(vectors[i], v));
    const mean = links.reduce((a, b) => a + b, 0) / links.length;
    const min = Math.min(...links);
    score = 0.75 * rubric + 0.25 * flowScore(mean);
    signals.push(
      { label: "Paragraph-to-paragraph similarity, mean", value: mean.toFixed(2), kind: "measured" },
      { label: "Weakest paragraph link", value: min.toFixed(2), kind: "measured" },
    );
    if (min < 0.3) {
      const at = links.indexOf(min);
      findings.push({
        severity: "medium",
        text: `Weak link between paragraphs ${at + 1} and ${at + 2}.`,
        detail: `Similarity ${min.toFixed(2)}. “${paras[at + 1].slice(0, 90)}…”`,
      });
    }
  } else {
    signals.push({ label: "Paragraph similarity", value: "Too few paragraphs", kind: "measured" });
  }

  return {
    key: "coherence",
    score,
    summary:
      findings.length === 0
        ? "Structure holds together."
        : `${answered.length - passed.length} structure check${answered.length - passed.length === 1 ? "" : "s"} failed.`,
    signals,
    findings,
  };
}
