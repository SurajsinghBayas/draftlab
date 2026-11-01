import { JUDGE_MODEL } from "../llm";
import { PROMPT_VERSION } from "../prompts";
import { Article, EMBED_MODEL } from "../retrieval";
import { wordCount } from "../text";
import { DraftInput, MetricKey, MetricResult, QualityReport } from "../types";
import { evaluateAdherence } from "./adherence";
import { evaluateCoherence } from "./coherence";
import { evaluateFactual } from "./factual";
import { evaluateGrammar } from "./grammar";
import { evaluateOriginality } from "./originality";

async function timed(key: MetricKey, run: () => Promise<Omit<MetricResult, "ms">>, onMetric?: (m: MetricResult) => void): Promise<MetricResult> {
  const started = Date.now();
  let result: MetricResult;
  try {
    result = { ...(await run()), ms: Date.now() - started };
  } catch (error) {
    // A failed metric reports null. It never falls back to a made-up number.
    const message = error instanceof Error ? error.message : String(error);
    result = { key, score: null, summary: "This check could not run.", signals: [], findings: [], ms: Date.now() - started, error: message };
  }
  onMetric?.(result);
  return result;
}

/** Runs all five metrics. Each result is reported as it finishes, so the UI can fill in live. */
export async function evaluateDraft(input: DraftInput, draft: string, onMetric?: (m: MetricResult) => void): Promise<QualityReport> {
  const started = Date.now();
  const corpus: Article[] = [];

  // Originality also compares against the articles the factual check fetched, so it runs second.
  const factualRun = timed("factual", () => evaluateFactual(input, draft, (a) => corpus.push(...a)), onMetric);
  const originalityRun = factualRun.then(() => timed("originality", () => evaluateOriginality(input, draft, corpus), onMetric));

  const [grammar, coherence, adherence, factual, originality] = await Promise.all([
    timed("grammar", () => evaluateGrammar(draft), onMetric),
    timed("coherence", () => evaluateCoherence(draft), onMetric),
    timed("adherence", () => evaluateAdherence(input, draft), onMetric),
    factualRun,
    originalityRun,
  ]);

  return {
    metrics: { grammar, coherence, adherence, factual, originality },
    meta: {
      judgeModel: JUDGE_MODEL,
      embedModel: EMBED_MODEL,
      promptVersion: PROMPT_VERSION,
      words: wordCount(draft),
      ms: Date.now() - started,
    },
  };
}
