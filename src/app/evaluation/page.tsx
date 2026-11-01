import type { Metadata } from "next";
import Link from "next/link";
import { SampleExplorer } from "@/components/SampleExplorer";
import { analyse } from "@/lib/analysis";
import { results } from "@/lib/results";
import { METRIC_KEYS, METRIC_LABELS, MetricKey } from "@/lib/types";

export const metadata: Metadata = { title: "Quality analysis · DraftLab" };

const a = analyse(results);
const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const round = (x: number | null) => (x === null ? "n/a" : Math.round(x).toString());

const WHAT_IT_MEANS: Record<MetricKey, string> = {
  grammar: "No errors found, and the check did catch the errors we injected.",
  coherence: "Reliable. Damaged structure lowered it every time.",
  adherence: "Good, though long formats run over the word target.",
  factual: "Low mostly because claims could not be confirmed, not because they were wrong. Also noisy.",
  originality: "No real copying found. The checks compare against Wikipedia only.",
};

function Section({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-serif text-2xl font-medium">{title}</h2>
      {intro && <div className="mt-2 text-sm text-ink-2 leading-relaxed max-w-[72ch]">{intro}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function EvaluationPage() {
  const { meta } = results;
  return (
    <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 py-8">
      <p className="eyebrow">Run of {new Date(meta.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      <h1 className="font-serif text-4xl font-medium tracking-tight mt-1">Quality analysis</h1>
      <p className="mt-3 max-w-[72ch] text-ink-2 leading-relaxed">
        {results.standard.length} representative prompts, three for each document type, written by <code className="font-mono text-sm">{meta.writerModel}</code> and reviewed by a different model, <code className="font-mono text-sm">{meta.judgeModel}</code>. All text and scores below are unedited output from <code className="font-mono text-sm">npm run eval</code>.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px mt-6 bg-line border border-line rounded overflow-hidden">
        {METRIC_KEYS.map((k) => (
          <div key={k} className="bg-surface p-3.5">
            <p className="text-xs font-medium text-ink-2">{METRIC_LABELS[k]}</p>
            <p className="font-mono text-3xl mt-1 tabular-nums">{round(a.means[k])}</p>
            <p className="text-xs text-muted mt-1.5 leading-snug">{WHAT_IT_MEANS[k]}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">Mean score out of 100. There is deliberately no overall score: averaging would let strong grammar hide a factual problem.</p>

      <Section title="Sample content and scores">
        <SampleExplorer rows={results.standard} />
      </Section>

      <Section
        title="Can these scores be trusted?"
        intro={
          <p>
            A score is only useful if it moves when quality changes. So the evaluator was tested too: three drafts were damaged in known ways and re-scored. It reacted as expected in <strong className="font-medium text-ink">{a.calibration.passed} of {a.calibration.n}</strong> tests.
          </p>
        }
      >
        <div className="overflow-x-auto border border-line rounded bg-surface">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                <th scope="col" className="px-3 py-2 font-medium">Damage applied</th>
                <th scope="col" className="px-3 py-2 font-medium">Metric</th>
                <th scope="col" className="px-3 py-2 font-medium">Expected</th>
                <th scope="col" className="px-3 py-2 font-medium">Score before → after, per draft</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Passed</th>
              </tr>
            </thead>
            <tbody>
              {a.calibration.byMutation.map((m) => (
                <tr key={m.mutation} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-normal text-left">{m.mutation}</th>
                  <td className="px-3 py-2 text-ink-2 whitespace-nowrap">{METRIC_LABELS[m.metric]}</td>
                  <td className="px-3 py-2 text-ink-2 whitespace-nowrap">{m.expectation === "drop" ? "Falls by 10+" : "Stays within 10"}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums">{m.rows.map((r) => `${round(r.before)}→${round(r.after)}`).join("   ")}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{m.passed} of {m.rows.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6 text-sm leading-relaxed text-ink-2">
          <div>
            <h3 className="font-medium text-ink">The grammar score is believable</h3>
            <p className="mt-1">
              All {results.standard.length} drafts scored 100 on grammar, which could have meant a lenient check. It did not: {a.grammarRecall.found} of {a.grammarRecall.injected} errors injected on purpose were counted. Those were simple spelling and agreement errors, so subtler ones may still pass. The score is per 100 words, so a few errors in a long draft cost little.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">The factual score is noisy</h3>
            <p className="mt-1">
              {results.retest.length} drafts were each re-checked three times with no change to the text. The largest movement was: {a.retestByMetric.map((m) => `${METRIC_LABELS[m.metric as MetricKey].toLowerCase()} ${Math.round(m.maxSpread)}`).join(", ")} points. A difference smaller than that is noise. A single factual score is a rough estimate, because the claims the reviewer picks can change between runs.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="What the checks found"
        intro={<p>Read with the drafts above. These are the patterns that held across the prompts.</p>}
      >
        <ul className="space-y-3 text-sm leading-relaxed text-ink-2 max-w-[80ch] list-disc pl-5">
          <li>
            <strong className="font-medium text-ink">Long formats overshoot.</strong> Against target length, emails averaged {pct(a.lengthByType("email"))}, reports {pct(a.lengthByType("report"))}, articles {pct(a.lengthByType("article"))}, and notes {pct(a.lengthByType("notes"))}. The writer was told to stay within 10%.
          </li>
          <li>
            <strong className="font-medium text-ink">Most claims could not be confirmed.</strong> Of {a.claims.supported + a.claims.unverified + a.claims.contradicted} claims checked, {a.claims.supported} were supported, {a.claims.unverified} stayed unverified, and {a.claims.contradicted} were contradicted. Many unverified ones are true, such as standard facts about binary search trees that Wikipedia&apos;s lead sections do not state. The factual score measures how much could be confirmed, not how much is correct.
          </li>
          <li>
            <strong className="font-medium text-ink">Close-paraphrase flags overreach on textbook topics.</strong> Verbatim overlap stayed near zero, yet some paragraphs were flagged by similarity alone. Notes on photosynthesis will resemble any description of photosynthesis. Read a flag as “check this”, not as plagiarism.
          </li>
          <li>
            <strong className="font-medium text-ink">A human reader still catches things the checks do not.</strong> The extension email opens “Dear Professor Smith”. Nobody supplied that name, and the draft still scored 100 on adherence. See <Link className="underline underline-offset-2 hover:text-accent" href="/risks">Risks</Link>.
          </li>
        </ul>
      </Section>

      <Section
        title="Does revision work?"
        intro={
          <p>
            Four drafts each received two revision requests. The reviewer judged {a.revision.applied} of {a.revision.n} as carried out. “About 30% shorter” produced a mean length of {Math.round(a.revision.meanShortRatio * 100)}% of the original, and {a.revision.factsKept} of {a.revision.factsRequired} required figures survived. Passage-only revision is safe by design: the app splices the new text in, so the rest stays identical.
          </p>
        }
      >
        <div className="overflow-x-auto border border-line rounded bg-surface">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                <th scope="col" className="px-3 py-2 font-medium">Draft</th>
                <th scope="col" className="px-3 py-2 font-medium">Request</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Words</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Figures kept</th>
                <th scope="col" className="px-3 py-2 font-medium">Reviewer</th>
              </tr>
            </thead>
            <tbody>
              {results.revision.map((r) => (
                <tr key={`${r.base}-${r.revision}`} className="border-b border-line last:border-0 align-top">
                  <th scope="row" className="px-3 py-2 font-mono text-xs font-normal text-left whitespace-nowrap">{r.base}</th>
                  <td className="px-3 py-2 text-ink-2">{r.instruction}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums">{r.wordsBefore}→{r.wordsAfter}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{r.factsRequired ? `${r.factsKept} of ${r.factsRequired}` : "None given"}</td>
                  <td className="px-3 py-2 text-xs text-ink-2"><span className={r.applied ? "" : "text-bad font-medium"}>{r.applied ? "Applied." : "Not applied."}</span> {r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Limits of this analysis">
        <ul className="space-y-1.5 text-sm leading-relaxed text-ink-2 max-w-[80ch] list-disc pl-5">
          <li>No person labelled these drafts, so reviewer agreement with human judgement was not measured.</li>
          <li>Twelve prompts and one run each show patterns, not statistically firm rates.</li>
          <li>Facts are checked against Wikipedia lead sections and originality against a small set of articles, not the whole web.</li>
          <li>The score weightings and thresholds are reasoned choices, documented in the code, not fitted to data.</li>
        </ul>
      </Section>
    </main>
  );
}
