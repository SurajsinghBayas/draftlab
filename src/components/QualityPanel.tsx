"use client";

import { useState } from "react";
import { Finding, METRIC_KEYS, METRIC_LABELS, MetricKey, MetricResult, QualityReport, SignalKind } from "@/lib/types";

const KIND_LABEL: Record<SignalKind, string> = { measured: "measured", judged: "reviewer", evidence: "evidence" };
const KIND_TITLE: Record<SignalKind, string> = {
  measured: "Computed by code. The same text always gives the same value.",
  judged: "The opinion of a second AI model. Treat it as advice.",
  evidence: "A second AI model's ruling, with its quote checked against fetched text.",
};

export function scoreBand(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Strong", color: "var(--good)" };
  if (score >= 65) return { label: "Review", color: "var(--warn)" };
  return { label: "Weak", color: "var(--bad)" };
}

const SEVERITY: Record<Finding["severity"], string> = { high: "text-bad", medium: "text-warn", low: "text-muted" };

function MetricRow({ metricKey, metric, previous, pending }: { metricKey: MetricKey; metric?: MetricResult; previous?: number | null; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const score = metric?.score ?? null;
  const band = score !== null ? scoreBand(score) : null;
  const delta = score !== null && previous !== null && previous !== undefined ? Math.round(score) - Math.round(previous) : null;

  return (
    <div className="border-t border-line py-2.5 first:border-t-0">
      <button type="button" className="w-full text-left cursor-pointer disabled:cursor-default" disabled={!metric} aria-expanded={open} onClick={() => setOpen(!open)}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[0.8125rem] font-medium">{METRIC_LABELS[metricKey]}</span>
          {pending && !metric && <span className="text-xs text-muted pulsing">Checking…</span>}
          {metric && score === null && <span className="text-xs text-muted">Not scored</span>}
          {band && (
            <span className="flex items-baseline gap-1.5">
              {delta !== null && delta !== 0 && (
                <span className="font-mono text-[0.6875rem] text-muted" title="Change since the previous checked version">
                  {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                </span>
              )}
              <span className="text-[0.6875rem] text-muted">{band.label}</span>
              <span className="font-mono text-base font-medium">{Math.round(score!)}</span>
            </span>
          )}
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-sunken overflow-hidden">
          {band && <div className="h-full rounded-full" style={{ width: `${Math.max(score!, 2)}%`, background: band.color }} />}
        </div>
        {metric && <p className="mt-1.5 text-xs text-ink-2 leading-snug">{metric.summary}</p>}
      </button>

      {open && metric && (
        <div className="mt-2 space-y-2.5">
          {metric.error && <p className="text-xs text-bad break-words">{metric.error}</p>}
          {metric.signals.length > 0 && (
            <dl className="text-xs space-y-1">
              {metric.signals.map((s) => (
                <div key={s.label} className="flex justify-between gap-3">
                  <dt className="text-ink-2">
                    {s.label} <span className="font-mono text-[0.625rem] text-muted cursor-help" title={KIND_TITLE[s.kind]}>{KIND_LABEL[s.kind]}</span>
                  </dt>
                  <dd className="font-mono text-right shrink-0">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {metric.findings.length > 0 && (
            <ul className="text-xs space-y-1.5 border-l-2 border-line pl-2.5">
              {metric.findings.map((f, i) => (
                <li key={i}>
                  <span className={SEVERITY[f.severity]}>{f.text}</span>
                  {f.detail && <span className="block text-muted mt-0.5 break-words">{f.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  metrics: Partial<Record<MetricKey, MetricResult>>;
  report?: QualityReport;
  previous?: QualityReport;
  versionLabel: string | null;
  running: boolean;
  canRun: boolean;
  error: string | null;
  onRun: () => void;
}

export function QualityPanel({ metrics, report, previous, versionLabel, running, canRun, error, onRun }: Props) {
  const started = running || Object.keys(metrics).length > 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold">Quality check</h2>
        {versionLabel && <span className="font-mono text-xs text-muted">{versionLabel}</span>}
      </div>

      <button type="button" className="btn w-full mt-1.5" disabled={!canRun || running} onClick={onRun}>
        {running ? "Checking…" : report ? "Check again" : "Check this version"}
      </button>
      {running && <p className="text-xs text-muted mt-2">This usually takes under a minute. Originality can take longest on a rate-limited API key.</p>}
      {error && <p role="alert" className="text-xs text-bad mt-2">{error}</p>}

      {started ? (
        <div className="mt-3">
          {METRIC_KEYS.map((k) => (
            <MetricRow key={k} metricKey={k} metric={metrics[k]} previous={previous?.metrics[k]?.score} pending={running} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Scores five things separately: {METRIC_KEYS.map((k) => METRIC_LABELS[k].toLowerCase()).join(", ")}. A second AI model does the reviewing, so the writer does not grade itself.
        </p>
      )}

      {report && (
        <p className="text-[0.6875rem] text-muted mt-2 font-mono">
          Reviewer {report.meta.judgeModel} · {(report.meta.ms / 1000).toFixed(0)}s
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3 text-xs text-muted leading-relaxed space-y-1.5">
        <p>
          <strong className="font-medium text-ink-2">These scores do not prove a draft is right.</strong> Facts are compared only with your key facts and Wikipedia, and originality only with those Wikipedia articles, not the whole web.
        </p>
        <p>Checking sends the draft&apos;s claims and topic to Wikipedia search, and its paragraphs to Voyage AI. Avoid checking confidential text.</p>
      </div>
    </div>
  );
}
