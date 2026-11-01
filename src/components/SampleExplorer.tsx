"use client";

import { useState } from "react";
import type { StandardRow } from "@/lib/results";
import { CONTENT_LABELS, CONTENT_TYPES, METRIC_KEYS, METRIC_LABELS, MetricKey, targetWords } from "@/lib/types";
import { Markdown } from "./Markdown";
import { scoreBand } from "./QualityPanel";

const SHORT: Record<MetricKey, string> = { grammar: "Grammar", coherence: "Coherence", adherence: "Adherence", factual: "Factual", originality: "Originality" };

/** Sequential shading in one hue: a stronger tint is a lower score, so weak cells stand out. */
function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <td className="px-2 py-1.5 text-center font-mono text-xs text-muted" title="Nothing to score">n/a</td>;
  const weight = Math.min(1, (100 - score) / 60);
  return (
    <td className="px-2 py-1.5 text-center font-mono text-sm tabular-nums" style={{ background: `rgb(var(--heat) / ${(weight * 0.42).toFixed(3)})` }}>
      {Math.round(score)}
    </td>
  );
}

const meanOf = (rows: StandardRow[], k: MetricKey) => {
  const v = rows.map((r) => r.report.metrics[k].score).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function SampleExplorer({ rows }: { rows: StandardRow[] }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  if (!selected) return null;
  const words = selected.report.meta.words;

  return (
    <div>
      <div className="overflow-x-auto border border-line rounded bg-surface">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <caption className="sr-only">Quality scores for each representative prompt. Select a row to read its draft.</caption>
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th scope="col" className="px-3 py-2 font-medium text-xs text-ink-2">Prompt</th>
              <th scope="col" className="px-2 py-2 font-medium text-xs text-ink-2 text-right">Words / target</th>
              {METRIC_KEYS.map((k) => (
                <th key={k} scope="col" className="px-2 py-2 font-medium text-xs text-ink-2 text-center w-[84px]">{SHORT[k]}</th>
              ))}
            </tr>
          </thead>
          {CONTENT_TYPES.map((type) => {
            const group = rows.filter((r) => r.input.contentType === type);
            if (group.length === 0) return null;
            return (
              <tbody key={type} className="border-b border-line-strong">
                {group.map((r) => (
                  <tr key={r.id} className={`border-b border-line cursor-pointer ${r.id === selected.id ? "outline outline-2 -outline-offset-2 outline-ink" : "hover:bg-sunken"}`} onClick={() => setSelectedId(r.id)}>
                    <th scope="row" className="px-3 py-1.5 font-normal text-left">
                      <button type="button" className="text-left cursor-pointer hover:underline underline-offset-2" onClick={() => setSelectedId(r.id)} aria-pressed={r.id === selected.id}>
                        {r.input.topic}
                      </button>
                    </th>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-muted tabular-nums whitespace-nowrap">
                      {r.report.meta.words} / {targetWords(r.input)}
                    </td>
                    {METRIC_KEYS.map((k) => <ScoreCell key={k} score={r.report.metrics[k].score} />)}
                  </tr>
                ))}
                <tr className="bg-sunken/60">
                  <th scope="row" colSpan={2} className="px-3 py-1 text-left font-medium text-xs text-ink-2">{CONTENT_LABELS[type]}, mean</th>
                  {METRIC_KEYS.map((k) => {
                    const m = meanOf(group, k);
                    return <td key={k} className="px-2 py-1 text-center font-mono text-xs font-medium tabular-nums">{m === null ? "n/a" : Math.round(m)}</td>;
                  })}
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="text-xs text-muted mt-2">A stronger tint marks a lower score. “n/a” means the draft made no claim that could be checked. Select a row to read its draft below.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 mt-6">
        <article className="bg-surface border border-line rounded p-5 sm:p-7 min-w-0">
          <p className="eyebrow mb-3">
            {CONTENT_LABELS[selected.input.contentType]} · {selected.input.tone} · for {selected.input.audience}
          </p>
          <dl className="text-xs text-ink-2 mb-5 pb-4 border-b border-line space-y-1">
            <div><dt className="inline font-medium">Topic: </dt><dd className="inline">{selected.input.topic}</dd></div>
            {selected.input.instructions && <div><dt className="inline font-medium">Instructions: </dt><dd className="inline">{selected.input.instructions}</dd></div>}
            {selected.input.keyFacts && <div><dt className="inline font-medium">Key facts: </dt><dd className="inline">{selected.input.keyFacts}</dd></div>}
          </dl>
          <Markdown>{selected.draft}</Markdown>
        </article>

        <aside className="space-y-4 min-w-0" aria-label="Reviewer findings">
          <p className="text-xs text-muted font-mono">{words} words · unedited model output</p>
          {METRIC_KEYS.map((k) => {
            const m = selected.report.metrics[k];
            return (
              <section key={k}>
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium">{METRIC_LABELS[k]}</h4>
                  {m.score !== null ? (
                    <span className="font-mono text-sm"><span className="text-xs text-muted font-sans mr-1.5">{scoreBand(m.score).label}</span>{Math.round(m.score)}</span>
                  ) : (
                    <span className="text-xs text-muted">Not scored</span>
                  )}
                </div>
                <p className="text-xs text-ink-2 mt-0.5">{m.summary}</p>
                {m.error && <p className="text-xs text-bad mt-0.5">{m.error}</p>}
                {m.findings.length > 0 && (
                  <ul className="text-xs mt-1.5 space-y-1 border-l-2 border-line pl-2.5">
                    {m.findings.slice(0, 7).map((f, i) => (
                      <li key={i} className={f.severity === "high" ? "text-bad" : f.severity === "medium" ? "text-warn" : "text-muted"}>
                        {f.text}
                      </li>
                    ))}
                    {m.findings.length > 7 && <li className="text-muted">and {m.findings.length - 7} more</li>}
                  </ul>
                )}
              </section>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
