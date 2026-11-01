import { Article, embed, fetchFullArticle, rankBm25, searchArticles, splitParagraphs } from "../retrieval";
import { clamp, cosine, paragraphs, stockPhrases, verbatimOverlap, wordCount } from "../text";
import type { DraftInput, Finding, MetricResult } from "../types";

/** Paragraph pairs at or above this cosine similarity are flagged as near-paraphrases. */
export const PARAPHRASE_THRESHOLD = 0.82;
/** Keeps one embedding batch well under the 10K tokens-per-minute free limit. */
const MAX_CORPUS_PARAGRAPHS = 25;

export function originalityScore(s: { containment: number; paraphraseShare: number; stockPer100: number }): number {
  // 25% of 6-grams copied scores 0 on its own. Paraphrase and cliches cost less.
  const verbatim = Math.min(100, s.containment * 400);
  const paraphrase = s.paraphraseShare * 50;
  const stock = Math.min(15, s.stockPer100 * 15);
  return clamp(100 - verbatim - paraphrase - stock);
}

/**
 * Compares the draft against the Wikipedia articles fetched for this topic and its claims.
 * This is a local similarity check. It is not a plagiarism search of the web, and the UI says so.
 */
export async function evaluateOriginality(
  input: DraftInput,
  draft: string,
  corpusArticles: Article[],
): Promise<Omit<MetricResult, "ms">> {
  const topical = await searchArticles(input.topic, 3).catch(() => [] as Article[]);
  // Copying usually comes from the body of the main article, so fetch that one in full.
  const main = topical[0] ? await fetchFullArticle(topical[0].title).catch(() => null) : null;
  const byTitle = new Map([...topical, ...corpusArticles, ...(main ? [main] : [])].map((a) => [a.title, a]));
  const articles = [...byTitle.values()];

  if (articles.length === 0) {
    return {
      key: "originality",
      score: null,
      summary: "No reference text could be fetched, so this was not scored.",
      signals: [{ label: "Reference articles", value: "0", kind: "measured" }],
      findings: [],
    };
  }

  const corpus = articles.map((a) => a.text).join("\n");
  const allowed = [input.topic, input.instructions, input.keyFacts].join("\n");
  const overlap = verbatimOverlap(draft, corpus, allowed);

  const draftParas = paragraphs(draft);
  const corpusParas = articles.flatMap(splitParagraphs);
  const candidates = rankBm25(draftParas.join(" ").slice(0, 4000), corpusParas.map((p) => p.text), MAX_CORPUS_PARAGRAPHS).map((i) => corpusParas[i]);

  // Sequential on purpose: the first call is usually a cache hit from the coherence check.
  const draftVecs = await embed(draftParas);
  const corpusVecs = await embed(candidates.map((c) => c.text));
  const nearest = draftVecs.map((v) => {
    let best = -1;
    let at = -1;
    corpusVecs.forEach((c, i) => {
      const s = cosine(v, c);
      if (s > best) {
        best = s;
        at = i;
      }
    });
    return { similarity: best, source: candidates[at] };
  });
  const flagged = nearest.map((n, i) => ({ ...n, para: draftParas[i] })).filter((n) => n.similarity >= PARAPHRASE_THRESHOLD);
  const paraphraseShare = draftParas.length ? flagged.length / draftParas.length : 0;

  const stock = stockPhrases(draft);
  const stockPer100 = (stock.length / Math.max(wordCount(draft), 1)) * 100;
  const score = originalityScore({ containment: overlap.containment, paraphraseShare, stockPer100 });

  const findings: Finding[] = [];
  if (overlap.longestWords >= 10) {
    findings.push({ severity: "high", text: `${overlap.longestWords} consecutive words match a reference article.`, detail: `“${overlap.longestRun.slice(0, 200)}”` });
  }
  for (const f of flagged) {
    findings.push({
      severity: "medium",
      text: `Paragraph closely tracks “${f.source.title}” (similarity ${f.similarity.toFixed(2)}).`,
      detail: `“${f.para.slice(0, 110)}…”`,
    });
  }
  if (stock.length) findings.push({ severity: "low", text: `Stock phrases: ${stock.join(", ")}` });

  const maxSim = nearest.length ? Math.max(...nearest.map((n) => n.similarity)) : null;
  return {
    key: "originality",
    score,
    summary: `${(overlap.containment * 100).toFixed(1)}% verbatim overlap with ${articles.length} reference article${articles.length === 1 ? "" : "s"}.`,
    signals: [
      { label: "6-word sequences found in references", value: `${(overlap.containment * 100).toFixed(1)}%`, kind: "measured" },
      { label: "Longest copied run", value: `${overlap.longestWords} words`, kind: "measured" },
      { label: "Paragraphs flagged as close paraphrase", value: `${flagged.length} of ${draftParas.length}`, kind: "measured" },
      { label: "Highest paragraph similarity", value: maxSim === null ? "n/a" : maxSim.toFixed(2), kind: "measured" },
      { label: "Stock phrases", value: String(stock.length), kind: "measured" },
      { label: "Reference articles compared", value: String(articles.length), kind: "measured" },
    ],
    findings,
  };
}
