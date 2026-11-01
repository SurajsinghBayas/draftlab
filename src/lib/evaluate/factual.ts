import { z } from "zod";
import { judgeJson } from "../llm";
import { Article, rankBm25, searchArticles, splitParagraphs } from "../retrieval";
import { clamp, extractFigures, mapLimit, quoteExists } from "../text";
import type { DraftInput, Finding, MetricResult } from "../types";

const MAX_CLAIMS = 6;
/** Past this, remaining claims stay unverified, so a rate-limited lookup cannot hang the page. */
const evidenceDeadlineMs = () => Number(process.env.EVIDENCE_DEADLINE_MS ?? 40_000);

const ExtractSchema = z.object({
  claims: z.array(z.object({ claim: z.string(), query: z.string() })),
  contradictions: z.array(z.object({ a: z.string(), b: z.string(), why: z.string() })).default([]),
});

const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.number(),
      verdict: z.enum(["supported", "contradicted", "unverified"]),
      source: z.enum(["key_facts", "evidence", "none"]),
      quote: z.string().default(""),
      why: z.string(),
    }),
  ),
});

export interface ClaimCheck {
  claim: string;
  verdict: "supported" | "contradicted" | "unverified";
  why: string;
  quote?: string;
  sourceUrl?: string;
}

/** Unverified is not the same as false, so it earns half credit rather than none. */
export function factualScore(c: { supported: number; unverified: number; contradicted: number; internal: number; unsourcedFigures: number }): number | null {
  const total = c.supported + c.unverified + c.contradicted;
  if (total === 0 && c.internal === 0 && c.unsourcedFigures === 0) return null;
  const base = total === 0 ? 100 : (100 * (c.supported + 0.5 * c.unverified + 0 * c.contradicted)) / total;
  return clamp(base - 30 * c.contradicted - 15 * c.internal - 5 * Math.min(c.unsourcedFigures, 4));
}

/**
 * Three steps: pull checkable claims from the draft, fetch evidence for each one,
 * then ask the reviewer to rule using only that evidence. A ruling must quote its evidence,
 * and the quote is checked by code, so "supported" cannot rest on the reviewer's memory.
 */
export async function evaluateFactual(
  input: DraftInput,
  draft: string,
  addToCorpus: (articles: Article[]) => void,
): Promise<Omit<MetricResult, "ms">> {
  const extracted = await judgeJson(
    ExtractSchema,
    `Extract up to ${MAX_CLAIMS} of the most checkable factual claims this draft makes about the outside world, such as figures, dates, named events, definitions, and causal statements. Prefer the riskiest claims.
Skip opinions, recommendations, requests, and statements about the author's own situation unless they repeat a key fact.
For each claim, write a short encyclopedia search query.
Also list any statements in the draft that contradict each other.

<brief>
Key facts: ${input.keyFacts || "(none)"}
</brief>

<draft>
${draft}
</draft>

Return {"claims":[{"claim":"...","query":"..."}],"contradictions":[{"a":"...","b":"...","why":"..."}]}.`,
  );
  const claims = extracted.claims.slice(0, MAX_CLAIMS);

  let wikiAvailable = true;
  const deadline = Date.now() + evidenceDeadlineMs();
  const evidence = await mapLimit(claims, 2, async (c) => {
    if (Date.now() > deadline) {
      wikiAvailable = false;
      return [];
    }
    try {
      const articles = await searchArticles(c.query, 3);
      addToCorpus(articles);
      const paras = articles.flatMap(splitParagraphs);
      return rankBm25(c.claim, paras.map((p) => p.text), 4).map((i) => paras[i]);
    } catch (error) {
      console.warn("[factual] evidence lookup failed:", String(error).slice(0, 160));
      wikiAvailable = false;
      return [];
    }
  });

  let checks: ClaimCheck[] = [];
  let rejected = 0;
  if (claims.length > 0) {
    const judged = await judgeJson(
      VerdictSchema,
      `Rule on each claim using only the key facts and evidence below. Do not use your own memory.
- supported: the key facts or evidence state it.
- contradicted: the key facts or evidence state something incompatible with it.
- unverified: neither of them settles it. Use this whenever you are unsure.
For supported and contradicted, "quote" must be an exact sentence fragment from the key facts or from that claim's evidence, and "source" says which one.

<brief>
Key facts: ${input.keyFacts || "(none)"}
</brief>

${claims
  .map(
    (c, i) => `Claim ${i}: ${c.claim}
<evidence>
${evidence[i].map((p) => p.text).join("\n") || "(no evidence found)"}
</evidence>`,
  )
  .join("\n\n")}

Return {"verdicts":[{"id":0,"verdict":"supported|contradicted|unverified","source":"key_facts|evidence|none","quote":"...","why":"one sentence"}]} with one entry per claim.`,
    );

    checks = claims.map((c, i) => {
      const v = judged.verdicts.find((x) => x.id === i);
      if (!v) return { claim: c.claim, verdict: "unverified" as const, why: "The reviewer gave no ruling." };
      if (v.verdict === "unverified") return { claim: c.claim, verdict: "unverified" as const, why: v.why };
      const sources = evidence[i];
      const inFacts = quoteExists(v.quote, input.keyFacts);
      const hit = sources.find((p) => quoteExists(v.quote, p.text));
      if (!inFacts && !hit) {
        rejected++;
        return { claim: c.claim, verdict: "unverified" as const, why: `Downgraded: the reviewer's quote is not in the evidence. (${v.why})` };
      }
      return { claim: c.claim, verdict: v.verdict, why: v.why, quote: v.quote, sourceUrl: inFacts ? undefined : hit?.url };
    });
  }

  // A figure is sourced only if the brief has it or a supported claim states it. Matching against
  // all fetched text is too loose: a small number like "15" occurs somewhere in nearly any article.
  const sourced = new Set(
    extractFigures(
      [
        input.topic,
        input.instructions,
        input.keyFacts,
        ...checks.filter((c) => c.verdict === "supported").flatMap((c) => [c.claim, c.quote ?? ""]),
      ].join("\n"),
    ),
  );
  const unsourced = extractFigures(draft).filter((f) => !sourced.has(f));

  const count = (v: ClaimCheck["verdict"]) => checks.filter((c) => c.verdict === v).length;
  const tally = {
    supported: count("supported"),
    unverified: count("unverified"),
    contradicted: count("contradicted"),
    internal: extracted.contradictions.length,
    unsourcedFigures: unsourced.length,
  };
  const score = factualScore(tally);

  const findings: Finding[] = [
    ...checks
      .filter((c) => c.verdict === "contradicted")
      .map((c) => ({ severity: "high" as const, text: `Contradicted: ${c.claim}`, detail: `${c.why} Evidence: “${c.quote}”` })),
    ...extracted.contradictions.map((c) => ({ severity: "high" as const, text: `Conflict inside the draft: ${c.why}`, detail: `“${c.a}” against “${c.b}”` })),
    ...(unsourced.length
      ? [{ severity: "medium" as const, text: `Figures with no source: ${unsourced.slice(0, 8).join(", ")}`, detail: "They appear in neither the brief nor any supported claim. Check them by hand." }]
      : []),
    ...checks
      .filter((c) => c.verdict === "unverified")
      .map((c) => ({ severity: "low" as const, text: `Unverified: ${c.claim}`, detail: c.why })),
    ...checks
      .filter((c) => c.verdict === "supported")
      .map((c) => ({ severity: "low" as const, text: `Supported: ${c.claim}`, detail: c.sourceUrl ? `Evidence: ${c.sourceUrl}` : "Evidence: the key facts" })),
  ];

  return {
    key: "factual",
    score,
    summary:
      score === null
        ? "No checkable claims in this draft."
        : `${tally.supported} supported, ${tally.unverified} unverified, ${tally.contradicted} contradicted.`,
    signals: [
      { label: "Claims supported by evidence", value: String(tally.supported), kind: "evidence" },
      { label: "Claims contradicted by evidence", value: String(tally.contradicted), kind: "evidence" },
      { label: "Claims left unverified", value: String(tally.unverified), kind: "evidence" },
      { label: "Conflicts inside the draft", value: String(tally.internal), kind: "judged" },
      { label: "Figures with no source", value: String(tally.unsourcedFigures), kind: "measured" },
      { label: "Rulings downgraded (bad quote)", value: String(rejected), kind: "measured" },
      { label: "Wikipedia reachable", value: wikiAvailable ? "Yes" : "No", kind: "measured" },
    ],
    findings,
  };
}
