"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DraftInput, DraftInputSchema, MetricKey, MetricResult, StreamEvent } from "@/lib/types";
import { BriefForm, EXAMPLES } from "./BriefForm";
import { DraftPane, Version } from "./DraftPane";
import { QualityPanel } from "./QualityPanel";

const STORAGE_KEY = "draftlab.session.v1";

async function readStream(url: string, body: unknown, signal: AbortSignal, onEvent: (e: StreamEvent) => void) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  signal.addEventListener("abort", () => void reader.cancel().catch(() => undefined), { once: true });
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function Studio() {
  const [brief, setBrief] = useState<DraftInput>(EXAMPLES[0].input);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [streaming, setStreaming] = useState<{ text: string; thinking: boolean; mode: "generate" | "revise" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [evalState, setEvalState] = useState<{ versionId: string; metrics: Partial<Record<MetricKey, MetricResult>>; running: boolean; error: string | null } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const abortWriter = useRef<AbortController | null>(null);
  const abortEval = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.brief) setBrief(saved.brief);
      if (Array.isArray(saved?.versions)) {
        setVersions(saved.versions);
        setActiveIndex(Math.min(saved.activeIndex ?? 0, Math.max(saved.versions.length - 1, 0)));
      }
    } catch {
      // Browser storage is a convenience. The app works without it.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ brief, versions, activeIndex }));
    } catch {
      // Same as above.
    }
  }, [brief, versions, activeIndex, hydrated]);

  const addVersion = useCallback((version: Omit<Version, "id">, base: Version[]) => {
    const next = [...base, { ...version, id: newId() }];
    setVersions(next);
    setActiveIndex(next.length - 1);
    return next;
  }, []);

  /** A draft becomes a version only when it finishes, so a failed revision leaves the draft alone. */
  const runWriter = useCallback(
    async (
      url: string,
      body: unknown,
      mode: "generate" | "revise",
      finish: (text: string) => { text: string; label: string; input: DraftInput },
      base: Version[],
    ) => {
      abortWriter.current?.abort();
      const controller = new AbortController();
      abortWriter.current = controller;
      setNotice(null);
      setStreaming({ text: "", thinking: false, mode });
      let text = "";
      let failure: string | null = null;
      let finishReason: string | null = null;
      let completed = false;
      try {
        await readStream(url, body, controller.signal, (event) => {
          if (controller.signal.aborted) return;
          if (event.t === "thinking") setStreaming((s) => (s ? { ...s, thinking: true } : s));
          if (event.t === "delta") {
            text += event.v;
            setStreaming((s) => (s ? { ...s, text } : s));
          }
          if (event.t === "done") {
            finishReason = event.finish;
            completed = true;
          }
          if (event.t === "error") failure = event.message;
        });
      } catch (error) {
        if (!controller.signal.aborted) failure = (error as Error).message;
      }
      // Stop has already cleared the screen, and a newer request may own it by now.
      if (controller.signal.aborted) return;
      setStreaming(null);
      if (!completed || !text.trim()) {
        setNotice(failure ?? "The connection ended early. Your draft is unchanged.");
        return;
      }
      addVersion(finish(text.trim()), base);
      if (finishReason === "length") setNotice("This draft hit the model's output limit and may be cut off at the end.");
    },
    [addVersion],
  );

  const stop = () => {
    abortWriter.current?.abort();
    setStreaming(null);
    setNotice("Stopped. The partial text was not saved.");
  };

  const generate = () => {
    const parsed = DraftInputSchema.safeParse(brief);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the brief");
      return;
    }
    setFormError(null);
    void runWriter("/api/generate", parsed.data, "generate", (text) => ({ text, label: "Generated", input: parsed.data }), versions);
  };

  const revise = (instruction: string, selection?: { start: number; end: number }) => {
    const current = versions[activeIndex];
    if (!current) return;
    const label = selection ? `Passage: ${instruction}` : `Revised: ${instruction}`;
    void runWriter(
      "/api/revise",
      { input: current.input, draft: current.text, instruction, selection },
      "revise",
      (text) => ({
        text: selection ? current.text.slice(0, selection.start) + text + current.text.slice(selection.end) : text,
        label,
        input: current.input,
      }),
      versions,
    );
  };

  const saveEdit = (text: string) => {
    const current = versions[activeIndex];
    if (current) addVersion({ text, label: "Edited by hand", input: current.input }, versions);
  };

  const evaluate = async () => {
    const current = versions[activeIndex];
    if (!current) return;
    abortEval.current?.abort();
    const controller = new AbortController();
    abortEval.current = controller;
    setEvalState({ versionId: current.id, metrics: {}, running: true, error: null });
    try {
      await readStream("/api/evaluate", { input: current.input, draft: current.text }, controller.signal, (event) => {
        if (event.t === "metric") {
          setEvalState((s) => (s && s.versionId === current.id ? { ...s, metrics: { ...s.metrics, [event.metric.key]: event.metric } } : s));
        }
        if (event.t === "report") {
          setVersions((list) => list.map((v) => (v.id === current.id ? { ...v, report: event.report } : v)));
          setEvalState((s) => (s && s.versionId === current.id ? { ...s, running: false } : s));
        }
        if (event.t === "error") {
          setEvalState((s) => (s && s.versionId === current.id ? { ...s, running: false, error: event.message } : s));
        }
      });
      setEvalState((s) => (s && s.versionId === current.id && s.running ? { ...s, running: false, error: "The check ended early. Try again." } : s));
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setEvalState((s) => (s && s.versionId === current.id ? { ...s, running: false, error: (error as Error).message } : s));
    }
  };

  const clear = () => {
    abortEval.current?.abort();
    setVersions([]);
    setActiveIndex(0);
    setEvalState(null);
    setNotice(null);
  };

  const active = versions[activeIndex];
  const live = evalState && active && evalState.versionId === active.id ? evalState : null;
  const metrics = live && (live.running || !active?.report) ? live.metrics : (active?.report?.metrics ?? {});
  // Compare with the nearest earlier version that has been checked.
  const previous = versions.slice(0, activeIndex).reverse().find((v) => v.report)?.report;

  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
      <aside className="border-b lg:border-b-0 lg:border-r border-line p-4 lg:overflow-y-auto" aria-label="Brief">
        <BriefForm value={brief} onChange={setBrief} onGenerate={generate} onCancel={stop} busy={streaming !== null} error={formError} />
      </aside>
      <section className="min-h-0 bg-surface/60" aria-label="Draft">
        <DraftPane versions={versions} activeIndex={activeIndex} onSelect={setActiveIndex} streaming={streaming} notice={notice} onRevise={revise} onSaveEdit={saveEdit} onClear={clear} />
      </section>
      <aside className="border-t lg:border-t-0 lg:border-l border-line p-4 lg:overflow-y-auto" aria-label="Quality check">
        <QualityPanel
          metrics={metrics}
          report={active?.report}
          previous={previous}
          versionLabel={active ? `v${activeIndex + 1}` : null}
          running={live?.running ?? false}
          canRun={!!active && streaming === null}
          error={live?.error ?? null}
          onRun={evaluate}
        />
      </aside>
    </main>
  );
}
