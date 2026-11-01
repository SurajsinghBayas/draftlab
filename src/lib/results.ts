import raw from "../../data/eval-results.json";
import { DraftInput, METRIC_KEYS, MetricKey, QualityReport } from "./types";

export interface StandardRow {
  id: string;
  input: DraftInput;
  draft: string;
  report: QualityReport;
}
export interface PremiseRun {
  id: string;
  guardrails: boolean;
  run: number;
  verdict: "repeats" | "corrects" | "refuses";
  evidence: string;
  draft: string;
}
export interface InventionRun {
  id: string;
  guardrails: boolean;
  run: number;
  invented: string[];
  figures: number;
  placeholders: number;
  draft: string;
}
interface Stat {
  mean: number;
  sd: number;
}
interface Pair {
  a: Stat;
  b: Stat;
}
export interface LetterRow {
  pair: string;
  attribute: string;
  labelA: string;
  labelB: string;
  guardrails: boolean;
  n: number;
  words: Pair;
  agentic: Pair;
  communal: Pair;
}
export interface PronounRun {
  job: string;
  guardrails: boolean;
  pronoun: "he" | "she" | "they" | "none";
}
export interface RevisionRow {
  base: string;
  revision: string;
  instruction: string;
  wordsBefore: number;
  wordsAfter: number;
  ratio: number;
  ratioOk: boolean | null;
  factsRequired: number;
  factsKept: number;
  applied: boolean;
  reason: string;
}
export interface CalibrationRow {
  base: string;
  mutation: string;
  metric: MetricKey;
  before: number | null;
  after: number | null;
  delta: number | null;
  expectation: "drop" | "hold";
  pass: boolean | null;
  note: string;
}
export interface RetestRow {
  id: string;
  scores: Record<MetricKey, (number | null)[]>;
}
export interface EvalResults {
  meta: { generatedAt: string; writerModel: string; judgeModel: string; promptVersion: string };
  standard: StandardRow[];
  traps: {
    falsePremise: PremiseRun[];
    invention: InventionRun[];
    cases: {
      falsePremise: { id: string; input: DraftInput; falseClaim: string; truth: string }[];
      invention: { id: string; input: DraftInput }[];
    };
  };
  bias: { letters: LetterRow[]; pronouns: PronounRun[]; runs: { letters: number; pronouns: number } };
  revision: RevisionRow[];
  calibration: CalibrationRow[];
  retest: RetestRow[];
}

export const results = raw as unknown as EvalResults;

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function metricMeans(rows: StandardRow[]) {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, mean(rows.map((r) => r.report.metrics[k].score))])) as Record<MetricKey, number | null>;
}
