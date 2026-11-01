"use client";

import { diffWordsWithSpace } from "diff";
import { SyntheticEvent, useMemo, useRef, useState } from "react";
import { wordCount } from "@/lib/text";
import { Markdown } from "./Markdown";

export interface Version {
  id: string;
  text: string;
  label: string;
  input: import("@/lib/types").DraftInput;
  report?: import("@/lib/types").QualityReport;
}

type View = "read" | "edit" | "compare";

const QUICK = [
  { label: "Shorter", text: "Make it about 25% shorter without losing any key point." },
  { label: "Simpler", text: "Use simpler words and shorter sentences." },
  { label: "More formal", text: "Make the tone more formal." },
  { label: "Warmer", text: "Make the tone warmer and more personal." },
  { label: "Add an example", text: "Add one concrete example where it helps most. Use a placeholder for any detail you do not have." },
];

interface Props {
  versions: Version[];
  activeIndex: number;
  onSelect: (index: number) => void;
  streaming: { text: string; thinking: boolean; mode: "generate" | "revise" } | null;
  notice: string | null;
  onRevise: (instruction: string, selection?: { start: number; end: number }) => void;
  onSaveEdit: (text: string) => void;
  onClear: () => void;
}

function Compare({ versions, activeIndex }: { versions: Version[]; activeIndex: number }) {
  const [baseIndex, setBaseIndex] = useState(Math.max(0, activeIndex - 1));
  const base = versions[Math.min(baseIndex, versions.length - 1)];
  const current = versions[activeIndex];
  const parts = useMemo(() => diffWordsWithSpace(base.text, current.text), [base.text, current.text]);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + wordCount(p.value), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + wordCount(p.value), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mb-4 pb-3 border-b border-line">
        <label className="flex items-center gap-1.5">
          Compare v{activeIndex + 1} against
          <select className="field !w-auto !py-0.5 !text-xs" value={baseIndex} onChange={(e) => setBaseIndex(Number(e.target.value))}>
            {versions.map((v, i) => (
              <option key={v.id} value={i} disabled={i === activeIndex}>
                v{i + 1}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono">+{added} / −{removed} words</span>
      </div>
      <div className="doc whitespace-pre-wrap">
        {parts.map((p, i) =>
          p.added ? (
            <ins key={i} className="diff-ins">{p.value}</ins>
          ) : p.removed ? (
            <del key={i} className="diff-del">{p.value}</del>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
      </div>
    </div>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DraftPane({ versions, activeIndex, onSelect, streaming, notice, onRevise, onSaveEdit, onClear }: Props) {
  const [view, setView] = useState<View>("read");
  const [instruction, setInstruction] = useState("");
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const active = versions[activeIndex];
  const busy = streaming !== null;
  const editText = edit && edit.id === active?.id ? edit.text : (active?.text ?? "");
  const dirty = !!active && editText !== active.text;
  const activeView: View = view === "compare" && versions.length < 2 ? "read" : view;

  const submitRevision = (text: string) => {
    if (!text.trim() || busy) return;
    // Unsaved typing becomes a version first, so the revision builds on what is on screen.
    if (dirty) onSaveEdit(editText);
    onRevise(text.trim(), activeView === "edit" && selection && !dirty ? selection : undefined);
    setInstruction("");
    setSelection(null);
    setView("read");
  };

  const readSelection = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    const { selectionStart: start, selectionEnd: end } = e.currentTarget;
    setSelection(end > start ? { start, end } : null);
  };

  const shownText = streaming ? streaming.text : (active?.text ?? "");
  const selectedWords = activeView === "edit" && selection ? wordCount(editText.slice(selection.start, selection.end)) : 0;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6 py-2 border-b border-line bg-paper">
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Versions">
          {versions.map((v, i) => (
            <button
              key={v.id}
              type="button"
              title={v.label}
              aria-pressed={i === activeIndex}
              disabled={busy}
              onClick={() => {
                onSelect(i);
                setSelection(null);
              }}
              className={`font-mono text-xs rounded px-1.5 py-0.5 cursor-pointer disabled:cursor-not-allowed ${i === activeIndex ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken"}`}
            >
              v{i + 1}
            </button>
          ))}
          {active && <span className="text-xs text-muted ml-1.5 hidden sm:inline">{active.label}</span>}
        </div>
        {active && (
          <div className="flex items-center gap-2">
            <div className="seg" role="tablist" aria-label="View">
              {(["read", "edit", "compare"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={activeView === v}
                  disabled={busy || (v === "compare" && versions.length < 2)}
                  className="!px-2.5 capitalize disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-5 min-h-[320px]">
        <div className="mx-auto max-w-[68ch]">
          {!active && !streaming && (
            <div className="py-16 lg:py-24">
              <p className="font-serif text-2xl leading-snug">Fill in the brief, and the draft appears here.</p>
              <p className="mt-3 text-sm text-muted leading-relaxed max-w-[48ch]">
                You can then revise the whole draft or just one passage, compare versions word by word, and check each version for quality.
              </p>
            </div>
          )}

          {streaming && !streaming.text && (
            <p className="eyebrow pulsing py-4" role="status">{streaming.thinking ? "The writer is planning…" : "Connecting to the writer…"}</p>
          )}

          {streaming && streaming.text && <Markdown className="caret">{shownText}</Markdown>}

          {!streaming && active && activeView === "read" && <Markdown>{active.text}</Markdown>}

          {!streaming && active && activeView === "edit" && (
            <>
              <textarea
                ref={textarea}
                aria-label="Edit the draft"
                className="w-full min-h-[55dvh] bg-surface border border-line-strong rounded p-3 font-mono text-[0.8125rem] leading-relaxed"
                value={editText}
                onChange={(e) => {
                  setEdit({ id: active.id, text: e.target.value });
                  setSelection(null);
                }}
                onSelect={readSelection}
                onMouseUp={readSelection}
                onKeyUp={readSelection}
              />
              {dirty && (
                <div className="flex gap-2 mt-2">
                  <button type="button" className="btn" onClick={() => onSaveEdit(editText)}>Save as new version</button>
                  <button type="button" className="btn" onClick={() => setEdit(null)}>Discard changes</button>
                </div>
              )}
            </>
          )}

          {!streaming && active && activeView === "compare" && <Compare key={active.id} versions={versions} activeIndex={activeIndex} />}
        </div>
      </div>

      {notice && <p role="alert" className="px-4 lg:px-6 py-2 text-xs text-warn border-t border-line bg-surface">{notice}</p>}

      {active && (
        <div className="border-t border-line bg-surface px-4 lg:px-6 py-3">
          <form
            className="mx-auto max-w-[68ch]"
            onSubmit={(e) => {
              e.preventDefault();
              submitRevision(instruction);
            }}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {QUICK.map((q) => (
                <button key={q.label} type="button" disabled={busy} onClick={() => submitRevision(q.text)} className="text-xs rounded-full border border-line-strong px-2.5 py-0.5 text-ink-2 hover:bg-sunken cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {q.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="field"
                aria-label="Revision request"
                maxLength={600}
                placeholder={selectedWords ? `Change the ${selectedWords} selected words…` : "Ask for a change…"}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !instruction.trim()}>Revise</button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-muted">
              <span>
                <span className="font-mono">{wordCount(active.text)} words</span>
                {activeView !== "edit" && <span className="hidden sm:inline"> · To change one passage, select it in Edit</span>}
              </span>
              <span className="flex gap-3">
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-ink cursor-pointer"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(active.text);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="underline underline-offset-2 hover:text-ink cursor-pointer" onClick={() => download(`draft-v${activeIndex + 1}.md`, active.text)}>Download .md</button>
                <button type="button" className="underline underline-offset-2 hover:text-ink cursor-pointer" onClick={() => { if (window.confirm("Delete all versions of this draft?")) onClear(); }}>Start over</button>
              </span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
