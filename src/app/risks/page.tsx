import type { Metadata } from "next";
import { analyse } from "@/lib/analysis";
import { results } from "@/lib/results";

export const metadata: Metadata = { title: "Risks · DraftLab" };

const a = analyse(results);
const on = a.inventionTotals(true);
const off = a.inventionTotals(false);
const pOn = a.pronounTotal(true);
const pOff = a.pronounTotal(false);
const notableLetters = a.letters.filter((l) => l.agenticNotable || l.communalNotable);

function Risk({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 pt-6 border-t border-line-strong">
      <p className="eyebrow">Risk {n}</p>
      <h2 className="font-serif text-2xl font-medium mt-0.5">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-ink-2 space-y-3 max-w-[76ch]">{children}</div>
    </section>
  );
}

function Controls({ does, remains }: { does: string; remains: string }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-4 mt-4 text-sm leading-relaxed">
      <div className="border-l-2 border-line-strong pl-3">
        <dt className="text-xs font-medium text-ink">What the app does</dt>
        <dd className="text-ink-2 mt-0.5">{does}</dd>
      </div>
      <div className="border-l-2 border-accent pl-3">
        <dt className="text-xs font-medium text-ink">What remains</dt>
        <dd className="text-ink-2 mt-0.5">{remains}</dd>
      </div>
    </dl>
  );
}

/** Two thin bars per group. Value labels are direct, and the legend names both series. */
function PairedBars({ rows, unit }: { rows: { label: string; on: number; off: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.on, r.off]));
  const Bar = ({ value, color, name }: { value: number; color: string; name: string }) => (
    <div className="flex items-center gap-2" title={`${name}: ${value.toFixed(1)} ${unit}`}>
      <div className="h-2.5 rounded-r" style={{ width: `${Math.max((value / max) * 100, 0.8)}%`, background: color, maxWidth: "calc(100% - 3rem)" }} />
      <span className="font-mono text-xs tabular-nums text-ink">{value.toFixed(1)}</span>
    </div>
  );
  return (
    <figure className="mt-4 max-w-[640px]">
      <div className="flex gap-4 text-xs text-ink-2 mb-3">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "var(--series-1)" }} />Guardrails on</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "var(--series-2)" }} />Guardrails off</span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-xs mb-1">{r.label}</p>
            <div className="space-y-[2px]">
              <Bar value={r.on} color="var(--series-1)" name="Guardrails on" />
              <Bar value={r.off} color="var(--series-2)" name="Guardrails off" />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="text-xs text-muted mt-3">Mean {unit} per draft, over {a.invention[0]?.on.n} drafts per bar.</figcaption>
    </figure>
  );
}

const SHORT_TOPIC: Record<string, string> = {
  "acme-q3": "Sales report for a company, with no data supplied",
  "board-minutes": "Summary of a meeting the writer knows nothing about",
  microplastics: "Notes asked to cite three studies, with none supplied",
  einstein: "“Einstein won the Nobel for relativity”",
  "great-wall": "“The Great Wall is visible from the Moon”",
  "ten-percent": "“Humans use only 10% of their brains”",
  mmr: "“The MMR vaccine causes autism”",
};

const tallyText = (t: { corrects: number; repeats: number; refuses: number; n: number }) =>
  [t.corrects && `${t.corrects} corrected`, t.repeats && `${t.repeats} repeated`, t.refuses && `${t.refuses} refused`].filter(Boolean).join(", ") + ` of ${t.n}`;

const mix = (t: { he: number; she: number; they: number; none: number }) =>
  [["she", t.she], ["he", t.he], ["they", t.they], ["no pronoun", t.none]].filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join(", ");

export default function RisksPage() {
  return (
    <main className="flex-1 w-full max-w-[860px] mx-auto px-4 py-8">
      <p className="eyebrow">Discussion</p>
      <h1 className="font-serif text-4xl font-medium tracking-tight mt-1">Risks of inaccurate or biased output</h1>
      <p className="mt-3 text-ink-2 leading-relaxed max-w-[70ch]">
        A language model writes fluent text whether or not it is correct, so a polished draft gives no signal of its accuracy. These risks were measured by testing the prompts most likely to go wrong, each repeated with the app&apos;s accuracy and fairness rules (its guardrails) on and off. Small samples mean these results show direction, not precise rates.
      </p>

      <Risk n={1} title="Invented facts, figures, and citations">
        <p>
          When a brief asks for specifics it does not supply, a model tends to produce them anyway. With guardrails off, <strong className="font-medium text-ink">{off.withInvention} of {off.n}</strong> drafts contained unsupplied specifics, about {Math.round(off.total / off.n)} per draft. With guardrails on, that fell to <strong className="font-medium text-ink">{on.withInvention} of {on.n}</strong>, about {Math.round(on.total / on.n)} per draft. The rules help a lot, but they do not solve this.
        </p>
        <PairedBars rows={a.invention.map((c) => ({ label: SHORT_TOPIC[c.id], on: c.on.meanInvented, off: c.off.meanInvented }))} unit="unsupplied specifics" />
        <p>
          Citations are the most dangerous failure. Even with guardrails on, the literature notes contained references such as <span className="font-mono text-xs">{a.invention.find((c) => c.id === "microplastics")?.on.examples[0]}</span> in {a.invention.find((c) => c.id === "microplastics")?.on.runsWithInvention} of {a.invention.find((c) => c.id === "microplastics")?.on.n} runs. These look real and were not checked against any database, so treat them as unverified until found. A student who submits one is responsible for it.
        </p>
        <Controls does="The writer is told to use [placeholders] instead of guessing. Key facts are checked by code. Figures that no source supports are flagged." remains="Invented names and citations pass unless someone reads them. Every reference must be looked up by hand." />
      </Risk>

      <Risk n={2} title="Accepting a false premise">
        <p>If a brief assumes something false, a model may build a confident document on it. Each prompt below states a well-known falsehood.</p>
        <div className="overflow-x-auto border border-line rounded bg-surface">
          <table className="w-full text-sm border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                <th scope="col" className="px-3 py-2 font-medium">The brief claims</th>
                <th scope="col" className="px-3 py-2 font-medium">Guardrails on</th>
                <th scope="col" className="px-3 py-2 font-medium">Guardrails off</th>
              </tr>
            </thead>
            <tbody>
              {a.premise.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-normal text-left">{SHORT_TOPIC[c.id]}</th>
                  <td className="px-3 py-2 text-xs">{tallyText(c.on)}</td>
                  <td className="px-3 py-2 text-xs">{tallyText(c.off)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The model handled famous myths well even without the rules. That result does not extend to obscure falsehoods, which these prompts did not test. The MMR row shows a second risk: without guardrails the model refused outright, so a parents&apos; committee would get no answer rather than the evidence. With them, it usually wrote the correction.
        </p>
        <Controls does="The rules tell the writer to correct false assumptions and not repeat them." remains="Correction relies on the model knowing the truth. A less famous false claim may simply be accepted." />
      </Risk>

      <Risk n={3} title="Claims nobody can confirm">
        <p>
          Across the {results.standard.length} standard drafts, {a.claims.supported} claims were supported, {a.claims.unverified} stayed unverified, and {a.claims.contradicted} were contradicted by the evidence. No contradiction does not mean no errors: most claims simply could not be confirmed against the Wikipedia text retrieved. Some of those are fine, while others may be wrong, and the tool cannot tell which.
        </p>
        <Controls does="Claims are checked against fetched text. A ruling must quote its evidence, and code verifies the quote exists. Weak rulings are downgraded." remains="Wikipedia is one imperfect source, and only lead sections are searched. Anything else stays “unverified”, and a reader has to decide." />
      </Risk>

      <Risk n={4} title="Biased assumptions about people">
        <p>
          <strong className="font-medium text-ink">Assumed gender.</strong> Asked to follow one worker through a day without any gender given, the model used these pronouns. Stereotypes predict “he” for surgeons and engineers. What appeared was different: with guardrails off, “she” was the most common choice in every role ({pOff.she} of {pOff.n} drafts), and “he” appeared in only {pOn.he + pOff.he} of {pOn.n + pOff.n} drafts overall. This is still an unrequested assumption. These tests cannot say why it happens. The guardrails raised neutral “they” from {pOff.they} to {pOn.they} of {pOn.n}, though “she” remained common, at {pOn.she}.
        </p>
        <div className="overflow-x-auto border border-line rounded bg-surface">
          <table className="w-full text-sm border-collapse min-w-[480px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs text-ink-2">
                <th scope="col" className="px-3 py-2 font-medium">Occupation</th>
                <th scope="col" className="px-3 py-2 font-medium">Guardrails on</th>
                <th scope="col" className="px-3 py-2 font-medium">Guardrails off</th>
              </tr>
            </thead>
            <tbody>
              {a.pronouns.map((p) => (
                <tr key={p.job} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-normal text-left capitalize">{p.job}</th>
                  <td className="px-3 py-2 text-xs font-mono">{mix(p.on)}</td>
                  <td className="px-3 py-2 text-xs font-mono">{mix(p.off)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong className="font-medium text-ink">Unequal letters.</strong> Recommendation letters were written from identical evidence, changing only the candidate&apos;s name or stated age, then compared for achievement (“agentic”) and warmth (“communal”) words, the distinction studied by Madera, Hebl and Martin (2009).{" "}
          {notableLetters.length === 0
            ? "No gap exceeded the variation between repeated runs."
            : `Of ${a.letters.length} comparisons, ${notableLetters.length} showed a gap larger than run-to-run variation: ${notableLetters.map((l) => `${l.labelA} vs ${l.labelB}, guardrails ${l.guardrails ? "on" : "off"}`).join("; ")}.`}{" "}
          With only {results.bias.runs.letters} letters per group and short word lists that have not been validated, this cannot show that bias is present or absent. It should be repeated at a larger scale before anyone relies on this for hiring.
        </p>
        <Controls does="The writer is told not to assume gender, age, nationality, religion, or ability, and to describe people by actions and evidence." remains="The rules reduce this but do not remove it. Tests covered a few attributes in English only. Do not use generated text for decisions about people without review." />
      </Risk>

      <Risk n={5} title="Trusting the automatic review too much">
        <p>
          The quality check is itself an AI system with blind spots, and a good score can create false confidence. In this run the extension email invented “Professor Smith” and still scored 100 on adherence. The factual score moved by up to {Math.round(a.retestByMetric.find((m) => m.metric === "factual")?.maxSpread ?? 0)} points when the same draft was re-checked unchanged. Close-paraphrase flags also fire on ordinary textbook content.
        </p>
        <Controls does="Shows five separate scores and no single grade. Labels each signal as measured, reviewer, or evidence. A failed check shows “Not scored”, never a default number. A different model does the reviewing." remains="The scores are prompts for a human reader. They do not replace one." />
      </Risk>

      <Risk n={6} title="Privacy and accountability">
        <p>
          A brief often contains private details. Generating sends it to the model provider, and checking sends claims to Wikipedia search and paragraphs to Voyage AI. Students also remain answerable for what they submit, and many institutions require AI use to be disclosed. Copying a draft unread would break that responsibility.
        </p>
        <Controls does="API keys stay on the server. Drafts are stored only in the user's own browser. The quality panel warns against checking confidential text." remains="This prototype has no accounts, audit log, or redaction, so it is not suited to confidential or regulated content." />
      </Risk>

      <section className="mt-12 pt-6 border-t border-line-strong">
        <h2 className="font-serif text-2xl font-medium">Recommended use</h2>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2 list-decimal pl-5 max-w-[76ch]">
          <li>Supply the facts yourself, and fill in every [placeholder] from a real source.</li>
          <li>Treat every name, figure, date, and citation the brief did not provide as wrong until you have checked it.</li>
          <li>Use low scores and flags to decide where to look. Do not treat high scores as approval.</li>
          <li>Have a person read anything that affects other people, such as hiring, grades, health, or legal matters.</li>
          <li>Disclose AI assistance as your institution or employer requires.</li>
        </ol>
      </section>
    </main>
  );
}
