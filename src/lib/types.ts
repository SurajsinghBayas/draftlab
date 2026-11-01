import { z } from "zod";

export const CONTENT_TYPES = ["email", "report", "article", "notes"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_LABELS: Record<ContentType, string> = {
  email: "Email",
  report: "Report",
  article: "Article",
  notes: "Academic notes",
};

export const TONES = [
  "Professional",
  "Friendly",
  "Persuasive",
  "Neutral",
  "Academic",
  "Empathetic",
  "Urgent",
] as const;

export const LENGTHS = ["short", "medium", "long", "custom"] as const;
export type LengthOption = (typeof LENGTHS)[number];

/** Word targets differ by format: a "long" email is still shorter than a short article. */
export const WORD_TARGETS: Record<ContentType, Record<Exclude<LengthOption, "custom">, number>> = {
  email: { short: 80, medium: 150, long: 250 },
  report: { short: 200, medium: 400, long: 800 },
  article: { short: 300, medium: 600, long: 1000 },
  notes: { short: 200, medium: 400, long: 700 },
};

export const DraftInputSchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  topic: z.string().trim().min(3, "Add a topic").max(300),
  instructions: z.string().trim().max(600).optional().default(""),
  audience: z.string().trim().min(2, "Name an audience").max(120),
  tone: z.enum(TONES),
  length: z.enum(LENGTHS),
  customWords: z.number().int().min(30).max(2000).optional(),
  keyFacts: z.string().trim().max(2000).optional().default(""),
});
export type DraftInput = z.infer<typeof DraftInputSchema>;

export function targetWords(input: Pick<DraftInput, "contentType" | "length" | "customWords">): number {
  if (input.length === "custom") return input.customWords ?? WORD_TARGETS[input.contentType].medium;
  return WORD_TARGETS[input.contentType][input.length];
}

export const METRIC_KEYS = ["grammar", "coherence", "adherence", "factual", "originality"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  grammar: "Grammar",
  coherence: "Coherence",
  adherence: "Prompt adherence",
  factual: "Factual consistency",
  originality: "Originality",
};

/**
 * Where a signal came from. The UI shows this so a reader can tell a count from an opinion:
 * measured = computed by code, judged = a model's opinion, evidence = a model's opinion
 * checked against text fetched from outside.
 */
export type SignalKind = "measured" | "judged" | "evidence";

export interface Signal {
  label: string;
  value: string;
  kind: SignalKind;
}

export interface Finding {
  severity: "high" | "medium" | "low";
  text: string;
  detail?: string;
}

export interface MetricResult {
  key: MetricKey;
  /** null means "could not be scored". It is never replaced by a default number. */
  score: number | null;
  summary: string;
  signals: Signal[];
  findings: Finding[];
  ms: number;
  error?: string;
}

export interface QualityReport {
  metrics: Record<MetricKey, MetricResult>;
  meta: { judgeModel: string; embedModel: string; promptVersion: string; words: number; ms: number };
}

/** One line of a streamed response from the API routes. */
export type StreamEvent =
  | { t: "delta"; v: string }
  | { t: "thinking" }
  | { t: "done"; model: string; finish: string | null }
  | { t: "metric"; metric: MetricResult }
  | { t: "report"; report: QualityReport }
  | { t: "error"; message: string };
