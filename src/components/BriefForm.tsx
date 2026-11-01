"use client";

import { CONTENT_LABELS, CONTENT_TYPES, ContentType, DraftInput, LENGTHS, LengthOption, targetWords, TONES } from "@/lib/types";

export const EXAMPLES: { label: string; input: DraftInput }[] = [
  {
    label: "Extension email",
    input: { contentType: "email", topic: "Requesting a two-day extension on a lab report because of illness", audience: "University professor", tone: "Professional", length: "short", instructions: "", keyFacts: "The report is due on 14 November. I am asking to submit it on 16 November. I have a doctor's note." },
  },
  {
    label: "E-waste report",
    input: { contentType: "report", topic: "Campus e-waste audit results", audience: "University administration", tone: "Professional", length: "short", instructions: "End with three practical recommendations.", keyFacts: "The campus produced 1.8 tonnes of e-waste last year. 23% was recycled. 40% was stored unused in departments." },
  },
  {
    label: "UPI article",
    input: { contentType: "article", topic: "Why India's UPI payment system spread so quickly", audience: "Technology professionals", tone: "Neutral", length: "short", instructions: "", keyFacts: "" },
  },
  {
    label: "Biology notes",
    input: { contentType: "notes", topic: "Photosynthesis: light reactions and the Calvin cycle", audience: "Class 11 biology students", tone: "Academic", length: "medium", instructions: "", keyFacts: "" },
  },
];

const LENGTH_LABEL: Record<LengthOption, string> = { short: "Short", medium: "Medium", long: "Long", custom: "Custom" };

interface Props {
  value: DraftInput;
  onChange: (next: DraftInput) => void;
  onGenerate: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}

export function BriefForm({ value, onChange, onGenerate, onCancel, busy, error }: Props) {
  const set = <K extends keyof DraftInput>(key: K, v: DraftInput[K]) => onChange({ ...value, [key]: v });

  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate();
      }}
    >
      <div>
        <span className="label" id="type-label">Document type</span>
        <div className="grid grid-cols-2 gap-1" role="group" aria-labelledby="type-label">
          {CONTENT_TYPES.map((t: ContentType) => (
            <button
              key={t}
              type="button"
              aria-pressed={value.contentType === t}
              onClick={() => set("contentType", t)}
              className={`rounded border px-2 py-1.5 text-[0.8rem] cursor-pointer ${value.contentType === t ? "border-ink bg-ink text-paper" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken"}`}
            >
              {CONTENT_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="topic">Topic</label>
        <textarea id="topic" className="field font-sans" rows={2} required minLength={3} maxLength={300} placeholder="What should this be about?" value={value.topic} onChange={(e) => set("topic", e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="audience">Audience</label>
        <input id="audience" className="field" required minLength={2} maxLength={120} list="audiences" placeholder="Who will read it?" value={value.audience} onChange={(e) => set("audience", e.target.value)} />
        <datalist id="audiences">
          <option value="University professor" />
          <option value="Senior leadership" />
          <option value="General readers" />
          <option value="Undergraduate students" />
          <option value="Non-technical client" />
        </datalist>
      </div>

      <div>
        <label className="label" htmlFor="tone">Tone</label>
        <select id="tone" className="field" value={value.tone} onChange={(e) => set("tone", e.target.value as DraftInput["tone"])}>
          {TONES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex justify-between items-baseline">
          <span className="label" id="length-label">Length</span>
          <span className="text-xs text-muted font-mono">about {targetWords(value)} words</span>
        </div>
        <div className="seg" role="group" aria-labelledby="length-label">
          {LENGTHS.map((l) => (
            <button key={l} type="button" aria-pressed={value.length === l} onClick={() => onChange({ ...value, length: l, customWords: l === "custom" ? (value.customWords ?? targetWords(value)) : value.customWords })}>
              {LENGTH_LABEL[l]}
            </button>
          ))}
        </div>
        {value.length === "custom" && (
          <input
            aria-label="Target word count"
            className="field mt-1.5"
            type="number"
            min={30}
            max={2000}
            step={10}
            value={value.customWords ?? ""}
            onChange={(e) => set("customWords", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        )}
      </div>

      <div>
        <label className="label" htmlFor="instructions">Instructions <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="instructions" className="field" rows={2} maxLength={600} placeholder="For example, end with three recommendations" value={value.instructions} onChange={(e) => set("instructions", e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="facts">Key facts to use <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="facts" className="field" rows={3} maxLength={2000} placeholder="Names, dates, and figures. Without these, the writer leaves [placeholders] instead of guessing." value={value.keyFacts} onChange={(e) => set("keyFacts", e.target.value)} />
      </div>

      {error && <p role="alert" className="text-sm text-bad">{error}</p>}

      {/* Separate keys matter. If React reused one button, a click on Stop would flip it to
          type="submit" before the browser's default action runs, and restart generation. */}
      {busy ? (
        <button key="stop" type="button" className="btn w-full" onClick={onCancel}>Stop</button>
      ) : (
        <button key="generate" type="submit" className="btn btn-primary w-full">Generate draft</button>
      )}

      <div>
        <p className="text-xs text-muted mb-1.5">Or start from an example</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="text-xs underline underline-offset-2 text-ink-2 hover:text-accent cursor-pointer" onClick={() => onChange(ex.input)}>
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
