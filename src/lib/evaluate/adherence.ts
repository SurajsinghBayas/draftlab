import { z } from "zod";
import { judgeJson } from "../llm";
import { extractFigures, lengthScore, paragraphs, placeholders, wordCount } from "../text";
import { CONTENT_LABELS, ContentType, DraftInput, Finding, MetricResult, targetWords } from "../types";

interface FormatCheck {
  label: string;
  test: (md: string) => boolean;
}

/** Format rules a regex can settle, so no model opinion is needed. */
export const FORMAT_CHECKS: Record<ContentType, FormatCheck[]> = {
  email: [
    { label: "Has a subject line", test: (m) => /^\W*subject\s*:/im.test(m) },
    { label: "Has a greeting", test: (m) => /^\W*(hi|hello|dear|good (morning|afternoon|evening)|greetings|team|all)\b/im.test(m) },
    { label: "Has a sign-off", test: (m) => /\b(regards|sincerely|best|thanks|thank you|cheers|respectfully)\b[^\n]*,?\s*\n+[^\n]*\S\s*$/i.test(m.trim()) },
    { label: "Uses no headings", test: (m) => !/^#{1,6}\s/m.test(m) },
  ],
  report: [
    { label: "Has a title", test: (m) => /^#\s+\S/m.test(m) },
    { label: "Has an executive summary", test: (m) => /^#{1,3}\s+.*(executive summary|summary)/im.test(m) },
    { label: "Has at least 3 sections", test: (m) => (m.match(/^##\s+\S/gm) ?? []).length >= 3 },
    { label: "Ends with recommendations or a conclusion", test: (m) => /^#{1,3}\s+.*(recommendation|conclusion|next steps)/im.test(m) },
  ],
  article: [
    { label: "Has a headline", test: (m) => /^#\s+\S/m.test(m) },
    { label: "Has at least 3 body paragraphs", test: (m) => paragraphs(m).filter((b) => wordCount(b) >= 20).length >= 3 },
  ],
  notes: [
    { label: "Has a title", test: (m) => /^#\s+\S/m.test(m) },
    { label: "Has concept headings", test: (m) => (m.match(/^##\s+\S/gm) ?? []).length >= 2 },
    { label: "Uses bullet points", test: (m) => (m.match(/^\s*[-*+]\s+/gm) ?? []).length >= 3 },
    { label: "Bolds key terms", test: (m) => (m.match(/\*\*[^*\n]+\*\*/g) ?? []).length >= 2 },
    { label: "Ends with key takeaways", test: (m) => /^#{1,3}\s+.*(takeaway|summary)/im.test(m) },
  ],
};

const Schema = z.object({
  checks: z.record(z.string(), z.object({ pass: z.boolean(), reason: z.string() })),
});

export function keyFactFigures(keyFacts: string): string[] {
  return extractFigures(keyFacts);
}

export async function evaluateAdherence(input: DraftInput, draft: string): Promise<Omit<MetricResult, "ms">> {
  const target = targetWords(input);
  const actual = wordCount(draft);
  const lenScore = lengthScore(actual, target);

  const format = FORMAT_CHECKS[input.contentType].map((c) => ({ label: c.label, ok: c.test(draft) }));
  const formatScore = (format.filter((c) => c.ok).length / format.length) * 100;

  const requiredFigures = keyFactFigures(input.keyFacts);
  const draftFigures = new Set(extractFigures(draft));
  const missingFigures = requiredFigures.filter((f) => !draftFigures.has(f));

  const checks: Record<string, string> = {
    on_topic: `The whole document addresses the topic: "${input.topic}".`,
    audience_fit: `Vocabulary, detail, and assumed knowledge suit this audience: "${input.audience}".`,
    tone_match: `The tone is "${input.tone}" throughout.`,
    format_fit: `It reads as a real ${CONTENT_LABELS[input.contentType]}, not another kind of document.`,
  };
  if (input.instructions) checks.instructions_followed = `Every point of these instructions is followed: "${input.instructions}".`;
  if (input.keyFacts) checks.key_facts_used = `Every key fact in the brief is used accurately.`;

  const judged = await judgeJson(
    Schema,
    `Judge how well this draft follows its brief. Mark each check pass or fail, with a reason of one sentence.

<brief>
Type: ${CONTENT_LABELS[input.contentType]}
Topic: ${input.topic}
Audience: ${input.audience}
Tone: ${input.tone}
Instructions: ${input.instructions || "(none)"}
Key facts: ${input.keyFacts || "(none)"}
</brief>

<draft>
${draft}
</draft>

Checks:
${Object.entries(checks)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

Return {"checks":{"on_topic":{"pass":true,"reason":"..."}, ...}} with every check present.`,
  );

  const answered = Object.keys(checks).filter((k) => judged.checks[k]);
  if (answered.length === 0) throw new Error("Reviewer answered none of the adherence checks");
  const passed = answered.filter((k) => judged.checks[k].pass);
  const judgedScore = (passed.length / answered.length) * 100;

  const score = 0.2 * lenScore + 0.2 * formatScore + 0.6 * judgedScore;

  const findings: Finding[] = [
    ...answered
      .filter((k) => !judged.checks[k].pass)
      .map((k) => ({ severity: "high" as const, text: checks[k], detail: judged.checks[k].reason })),
    ...format.filter((c) => !c.ok).map((c) => ({ severity: "medium" as const, text: `Format: ${c.label.toLowerCase()} is missing.` })),
    ...missingFigures.map((f) => ({ severity: "high" as const, text: `Key fact figure “${f}” does not appear in the draft.` })),
  ];
  if (lenScore < 100) {
    const pct = Math.round(((actual - target) / target) * 100);
    findings.push({ severity: "medium", text: `Length is ${pct > 0 ? "+" : ""}${pct}% against the ${target}-word target.` });
  }

  const holes = placeholders(draft);
  return {
    key: "adherence",
    score,
    summary: `${actual} of about ${target} words. ${passed.length} of ${answered.length} brief checks passed.`,
    signals: [
      { label: "Word count against target", value: `${actual} / ${target}`, kind: "measured" },
      { label: "Format rules met", value: `${format.filter((c) => c.ok).length} of ${format.length}`, kind: "measured" },
      { label: "Key fact figures present", value: requiredFigures.length ? `${requiredFigures.length - missingFigures.length} of ${requiredFigures.length}` : "None given", kind: "measured" },
      { label: "Brief checks passed", value: `${passed.length} of ${answered.length}`, kind: "judged" },
      { label: "Placeholders to fill", value: String(holes.length), kind: "measured" },
    ],
    findings,
  };
}
