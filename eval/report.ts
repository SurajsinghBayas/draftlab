/**
 * Builds docs/report.pdf from the college template's structure and the saved evaluation run.
 *   npm run report -- --group 7 --subject "Applied AI" --to "Prof. Name"
 * Requires screenshots in docs/img (studio.png, analysis.png) and a Chromium from Playwright.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { analyse } from "../src/lib/analysis";
import { results } from "../src/lib/results";
import { CONTENT_LABELS, METRIC_KEYS, METRIC_LABELS, MetricKey } from "../src/lib/types";

const { values: args } = parseArgs({ options: { group: { type: "string" }, subject: { type: "string" }, to: { type: "string" } } });

const TEAM = [
  { name: "Pankaj Sakhare", roll: "53" },
  { name: "Vardhan Yemul", roll: "40" },
  { name: "Ganesh Bansode", roll: "57" },
  { name: "Om Bise", roll: "11" },
];

const a = analyse(results);
const round = (x: number | null) => (x === null ? "n/a" : Math.round(x).toString());
const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const img = (name: string) => {
  const path = `docs/img/${name}`;
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
};
const blank = (value: string | undefined, width = 16) => (value ? esc(value) : "_".repeat(width));

const on = a.inventionTotals(true);
const off = a.inventionTotals(false);
const pOn = a.pronounTotal(true);
const pOff = a.pronounTotal(false);
const totalClaims = a.claims.supported + a.claims.unverified + a.claims.contradicted;
const factualSpread = a.retestByMetric.find((m) => m.metric === "factual")?.maxSpread ?? 0;
const sample = results.standard.find((s) => s.id === "report-ewaste")!;
const sampleExcerpt = sample.draft.split(/\n\s*\n/).slice(0, 3).join("\n\n");

const mdToHtml = (md: string) =>
  md
    .split(/\n\s*\n/)
    .map((b) => {
      const t = esc(b.trim()).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      if (t.startsWith("# ")) return `<p class="s-h1">${t.slice(2)}</p>`;
      const h = t.match(/^## (.*?)(?:\n([\s\S]*))?$/);
      if (h) return `<p class="s-h2">${h[1]}</p>${h[2] ? `<p>${h[2]}</p>` : ""}`;
      return `<p>${t}</p>`;
    })
    .join("");

const DIAGRAM = `
<svg viewBox="0 0 640 262" width="100%" role="img" aria-label="Workflow of DraftLab" style="font-family:'Times New Roman',serif;font-size:12.5px">
  <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 z" fill="#111"/></marker></defs>
  <g fill="#fff" stroke="#111" stroke-width="1">
    <rect x="4" y="20" width="118" height="62"/><rect x="164" y="20" width="118" height="62"/><rect x="324" y="20" width="118" height="62"/><rect x="484" y="20" width="150" height="62"/>
    <rect x="484" y="118" width="150" height="46"/>
    <rect x="164" y="118" width="278" height="74"/>
    <rect x="4" y="118" width="118" height="74"/>
    <rect x="164" y="214" width="130" height="40"/><rect x="312" y="214" width="130" height="40"/>
  </g>
  <g fill="#111" text-anchor="middle">
    <text x="63" y="42" font-weight="bold">User brief</text><text x="63" y="58">topic, audience,</text><text x="63" y="72">tone, length, facts</text>
    <text x="223" y="42" font-weight="bold">Prompt builder</text><text x="223" y="58">format rules and</text><text x="223" y="72">accuracy guardrails</text>
    <text x="383" y="42" font-weight="bold">Writer model</text><text x="383" y="58">openai.gpt-oss-120b</text><text x="383" y="72">(streamed)</text>
    <text x="559" y="42" font-weight="bold">Draft versions</text><text x="559" y="58">v1, v2, v3 with</text><text x="559" y="72">word-level compare</text>
    <text x="559" y="137" font-weight="bold">Revision request</text><text x="559" y="153">whole draft or one passage</text>
    <text x="303" y="137" font-weight="bold">Quality evaluator (separate reviewer: zai.glm-5)</text>
    <text x="303" y="156">grammar · coherence · prompt adherence</text><text x="303" y="174">factual consistency · originality</text>
    <text x="63" y="140" font-weight="bold">Quality report</text><text x="63" y="156">five scores with</text><text x="63" y="172">findings, no grade</text>
    <text x="229" y="231" font-weight="bold">Wikipedia</text><text x="229" y="246">evidence and references</text>
    <text x="377" y="231" font-weight="bold">Voyage voyage-4</text><text x="377" y="246">embeddings</text>
  </g>
  <g stroke="#111" fill="none" marker-end="url(#ar)">
    <path d="M122,51 H162"/><path d="M282,51 H322"/><path d="M442,51 H482"/>
    <path d="M590,82 V116"/><path d="M528,118 V84"/>
    <path d="M484,70 L442,118" /><path d="M164,155 H124"/>
    <path d="M229,214 V194"/><path d="M377,214 V194"/>
    <path d="M484,30 Q403,4 323,18" stroke-dasharray="4 3"/>
  </g>
  <text x="403" y="8" font-size="11" text-anchor="middle" fill="#111">a revision goes back to the writer</text>
</svg>`;

const scoreRows = results.standard
  .map(
    (s) => `<tr><td>${CONTENT_LABELS[s.input.contentType]}: ${esc(s.input.topic)}</td>${METRIC_KEYS.map((k) => `<td class="n">${round(s.report.metrics[k].score)}</td>`).join("")}</tr>`,
  )
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>DraftLab Case Study Report</title><style>
@page { size: A4; margin: 25mm 25mm 22mm 25mm; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; text-align: justify; }
.c { text-align: center; }
.college { font-weight: bold; font-size: 14pt; line-height: 1.35; margin: 0; }
.dept { margin: 4pt 0 0; }
.title { font-weight: bold; font-size: 16pt; margin: 4pt 0 0; }
h2 { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 13pt; font-weight: bold; margin: 12pt 0 2pt; break-after: avoid; text-align: left; line-height: 1.3; }
h3 { font-size: 12pt; font-weight: bold; margin: 8pt 0 0; break-after: avoid; text-align: left; }
h2.members { margin-top: 12pt; }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt; padding-left: 18pt; }
li { margin-bottom: 1pt; }
table { border-collapse: collapse; width: 100%; font-size: 11pt; line-height: 1.25; margin: 2pt 0 8pt; text-align: left; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid #555; padding: 2.5pt 5pt; vertical-align: top; }
th { font-weight: bold; }
td.n { text-align: center; white-space: nowrap; }
table.small { font-size: 10pt; }
.cap { font-size: 10.5pt; text-align: center; margin: 2pt 0 8pt; line-height: 1.25; }
figure { margin: 4pt 0 2pt; break-inside: avoid; }
figure img { width: 100%; border: 1px solid #888; display: block; }
.sample { border: 1px solid #888; padding: 6pt 9pt; font-size: 10.5pt; line-height: 1.3; margin-bottom: 4pt; break-inside: avoid; text-align: left; }
.sample p { margin: 0 0 4pt; }
.s-h1 { font-weight: bold; font-size: 11.5pt; }
.s-h2 { font-weight: bold; margin-bottom: 1pt; }
.refs li { margin-bottom: 2pt; text-align: left; overflow-wrap: anywhere; }
</style></head><body>

<div class="c">
  <p class="college">N. K. ORCHID COLLEGE OF ENGINEERING &amp; TECHNOLOGY,<br>SOLAPUR</p>
  <p class="dept">Department of Artificial Intelligence &amp; Data Science</p>
  <p class="title">SIMPLE CASE STUDY REPORT</p>
  <p>Academic Year: 2026–27</p>
</div>

<table>
  <tr><td style="width:48%">Case Study Title</td><td>DraftLab: A GPT-Powered Content Generation Application with Quality Evaluation</td></tr>
  <tr><td>Group Number</td><td>${blank(args.group)}</td></tr>
  <tr><td>Subject</td><td>${blank(args.subject)}</td></tr>
  <tr><td>Submitted To</td><td>${blank(args.to)}</td></tr>
</table>

<h2 class="members">Group Members</h2>
<table>
  <tr><th style="width:15%;font-weight:normal">Sr. No.</th><th style="font-weight:normal">Student Name</th><th style="width:22%;font-weight:normal">Class</th><th style="width:20%;font-weight:normal">Roll Number</th></tr>
  ${TEAM.map((m, i) => `<tr><td>${i + 1}</td><td>${m.name}</td><td>B.Tech AI&amp;DS</td><td>${m.roll}</td></tr>`).join("")}
</table>

<h2>1. Introduction</h2>
<p>Students and professionals spend much of their time writing routine documents such as emails, reports, articles, and study notes. Large language models can draft these in seconds, which makes them useful, but a fluent draft may still be wrong, biased, or off-brief. A polished style gives the reader no signal of its accuracy.</p>
<p>DraftLab is a web application that turns a short brief into one of these four document types, lets the user revise the draft, and then checks its quality on five separate measures. The application matters because it treats the checking as seriously as the generating.</p>

<h2>2. Problem Statement</h2>
<p>To design a GPT-powered content generation application that converts short user instructions into emails, reports, articles, or academic notes, with input fields for topic, audience, tone, and length, and the ability to revise generated drafts. The generated content must be evaluated for grammar, coherence, prompt adherence, factual consistency, and originality on representative prompts, and the risks of inaccurate or biased output must be discussed.</p>

<h2>3. Objectives</h2>
<ol>
  <li>Build a working prototype that generates four document types from a structured brief and supports revision of a whole draft or a single passage.</li>
  <li>Implement an evaluator for the five required quality measures, separating what is computed by code from what is a model's opinion.</li>
  <li>Measure quality on representative prompts, and test whether the evaluator itself detects deliberately damaged drafts.</li>
  <li>Measure the risks of inaccurate and biased output, and test how far prompt-level guardrails reduce them.</li>
</ol>

<h2>4. Existing System</h2>
<p>People currently either write by hand, which is slow, or paste a request into a general chat assistant. The chat approach has these limitations:</p>
<ul>
  <li>Audience, tone, length, and format must be restated each time and are not enforced.</li>
  <li>Revising usually regenerates the entire text, with no precise record of what changed.</li>
  <li>There is no built-in quality check, so errors and invented details are found only if the reader looks for them.</li>
  <li>Grammar tools check language but not facts, and plagiarism tools check copying but not fit to the brief. No single step covers all five measures.</li>
</ul>

<h2>5. Proposed Solution / Methodology</h2>
<p>The workflow is shown in Figure 1 and has five steps.</p>
<figure>${DIAGRAM}</figure>
<p class="cap">Figure 1: Workflow of the DraftLab application</p>
<ol>
  <li><b>Brief.</b> The user selects a document type and enters a topic, audience, tone, and length, with optional instructions and key facts.</li>
  <li><b>Generation.</b> A prompt is built with format rules and accuracy guardrails, such as using a [placeholder] for an unknown detail instead of guessing. The writer model streams the draft to the screen.</li>
  <li><b>Revision.</b> The user can request a change, select one passage to rewrite, or edit by hand. Each change is saved as a new version, and any two versions can be compared word by word. A failed revision leaves the draft unchanged.</li>
  <li><b>Evaluation.</b> Each measure is scored separately, as described below. A different model does the reviewing, because a model grading its own output tends to favour it.</li>
  <li><b>Validation.</b> A test harness runs representative prompts, risk tests, and deliberate damage tests, and saves all results.</li>
</ol>
<table class="small">
  <tr><th style="width:24%">Measure</th><th>How it is scored</th></tr>
  <tr><td>Grammar</td><td>Reviewer lists errors; each quote is checked to exist in the draft. Mechanical errors are found by rules. Score falls with errors per 100 words.</td></tr>
  <tr><td>Coherence</td><td>Six structural pass/fail checks by the reviewer (75%) and similarity of neighbouring paragraphs from embeddings (25%).</td></tr>
  <tr><td>Prompt adherence</td><td>Word count against target (20%), format rules checked by code (20%), and reviewer checks for topic, audience, tone, and instructions (60%).</td></tr>
  <tr><td>Factual consistency</td><td>Up to six claims are extracted, evidence is fetched from Wikipedia and ranked with BM25, and the reviewer rules using only that evidence. A ruling without a real quote is downgraded to unverified.</td></tr>
  <tr><td>Originality</td><td>Six-word sequences matched against reference articles, paragraph similarity by embeddings, and a count of stock phrases.</td></tr>
</table>

<h2>6. Tools and Technologies</h2>
<ul>
  <li><b>Languages and framework:</b> TypeScript, Next.js 16, React 19, Tailwind CSS.</li>
  <li><b>Writer model:</b> OpenAI gpt-oss-120b, through the OpenAI SDK and the Amazon Bedrock Mantle endpoint.</li>
  <li><b>Reviewer model:</b> Z.ai GLM-5, on the same endpoint, at temperature 0 with schema-checked JSON output.</li>
  <li><b>AI and NLP methods:</b> Voyage AI voyage-4 embeddings, cosine similarity, BM25 ranking, word n-gram matching, and Flesch reading ease.</li>
  <li><b>Data sources:</b> the Wikipedia API for evidence, and our own evaluation set of ${results.standard.length} standard prompts, ${a.premise.length} false-premise prompts, ${a.invention.length} missing-information prompts, and bias test prompts.</li>
  <li><b>Testing:</b> Vitest for unit tests and Playwright for browser testing.</li>
</ul>

<h2>7. Results / Expected Outcome</h2>
<p>The prototype is functional. Figure 2 shows the application after generating a draft and checking its quality.</p>
<figure><img src="${img("studio.png")}" alt="DraftLab Studio screen"></figure>
<p class="cap">Figure 2: The Studio screen with the brief, a generated draft, and the quality check</p>

<h3>Sample input and output</h3>
<div class="sample">
  <p><b>Input.</b> Type: ${CONTENT_LABELS[sample.input.contentType]}. Topic: ${esc(sample.input.topic)}. Audience: ${esc(sample.input.audience)}. Tone: ${sample.input.tone}. Length: ${sample.input.length}. Key facts: ${esc(sample.input.keyFacts)}</p>
  <p><b>Generated output (opening, unedited):</b></p>
  ${mdToHtml(sampleExcerpt)}
</div>
<p>This sample shows both the strength and the main risk. The three key facts are used correctly, but the statement that most waste comes from central IT services and academic labs was not in the brief. The model added it, and a reader who assumes it came from the audit would be misled.</p>

<h3>Quality scores on representative prompts</h3>
<table class="small">
  <thead><tr><th>Prompt</th>${METRIC_KEYS.map((k: MetricKey) => `<th class="n" style="font-size:9pt">${METRIC_LABELS[k].replace("Prompt adherence", "Adher.").replace("Factual consistency", "Factual").replace("Originality", "Orig.").replace("Coherence", "Coher.").replace("Grammar", "Gram.")}</th>`).join("")}</tr></thead>
  ${scoreRows}
  <tr><th>Mean</th>${METRIC_KEYS.map((k) => `<th class="n">${round(a.means[k])}</th>`).join("")}</tr>
</table>
<p class="cap">Table 1: Scores out of 100. “n/a” means the draft made no checkable claim.</p>

<h3>Analysis</h3>
<ul>
  <li><b>Grammar (${round(a.means.grammar)}).</b> Every draft scored 100. This is credible, because the check counted ${a.grammarRecall.found} of ${a.grammarRecall.injected} errors we injected, although those were simple spelling and agreement errors.</li>
  <li><b>Coherence (${round(a.means.coherence)}) and adherence (${round(a.means.adherence)}).</b> Both were strong. The main weakness was length: emails averaged ${pct(a.lengthByType("email"))} against target, but reports ${pct(a.lengthByType("report"))}, articles ${pct(a.lengthByType("article"))}, and notes ${pct(a.lengthByType("notes"))}.</li>
  <li><b>Factual consistency (${round(a.means.factual)}).</b> Of ${totalClaims} claims, ${a.claims.supported} were supported, ${a.claims.unverified} unverified, and ${a.claims.contradicted} contradicted. The score is low mainly because claims could not be confirmed from Wikipedia's lead sections, and several of those are in fact true. It also varied by up to ${Math.round(factualSpread)} points when the same draft was re-checked, so a single value is only a rough estimate.</li>
  <li><b>Originality (${round(a.means.originality)}).</b> Little verbatim overlap was found. Some paragraphs were flagged by similarity, but on textbook topics this often means the same subject rather than copying.</li>
  <li><b>Revision.</b> The reviewer judged ${a.revision.applied} of ${a.revision.n} revision requests as carried out, “about 30% shorter” gave a mean of ${Math.round(a.revision.meanShortRatio * 100)}% of the original length, and ${a.revision.factsKept} of ${a.revision.factsRequired} required figures were preserved.</li>
  <li><b>Validity of the evaluator.</b> Across deliberate damage such as shuffled sections, pasted Wikipedia text, and inserted false statements, the scores responded as expected in ${a.calibration.passed} of ${a.calibration.n} tests. A hidden note telling the reviewer to pass everything did not raise scores.</li>
</ul>

<h3>Risks of inaccurate or biased output</h3>
<table class="small">
  <thead><tr><th style="width:27%">Test</th><th>Guardrails on</th><th>Guardrails off</th></tr></thead>
  <tr><td>Briefs asking for details not supplied: drafts containing unsupplied specifics</td><td>${on.withInvention} of ${on.n} drafts (about ${Math.round(on.total / on.n)} per draft)</td><td>${off.withInvention} of ${off.n} drafts (about ${Math.round(off.total / off.n)} per draft)</td></tr>
  ${a.premise.map((p) => `<tr><td>False premise: ${esc(p.id === "mmr" ? "MMR vaccine causes autism" : p.id === "einstein" ? "Einstein's Nobel for relativity" : p.id === "great-wall" ? "Great Wall visible from Moon" : "Only 10% of the brain used")}</td><td>${p.on.corrects} corrected, ${p.on.repeats} repeated, ${p.on.refuses} refused</td><td>${p.off.corrects} corrected, ${p.off.repeats} repeated, ${p.off.refuses} refused</td></tr>`).join("")}
  <tr><td>Pronoun assumed for a worker of unstated gender, across ${a.pronouns.length} occupations</td><td>she ${pOn.she}, he ${pOn.he}, they ${pOn.they}, none ${pOn.none}</td><td>she ${pOff.she}, he ${pOff.he}, they ${pOff.they}, none ${pOff.none}</td></tr>
</table>
<p class="cap">Table 2: Risk tests with the accuracy and fairness rules switched on and off</p>
<ul>
  <li><b>Inaccuracy.</b> When asked for details it does not have, the model tends to invent them. Without guardrails, a sales report contained made-up revenue figures. Guardrails greatly reduced this but did not remove it: literature notes still contained realistic-looking citations such as “${esc(a.invention.find((c) => c.id === "microplastics")?.on.examples[0] ?? "")}”, which must be treated as unverified.</li>
  <li><b>Bias.</b> The model did not follow the expected stereotype of “he” for surgeons and engineers. Without guardrails, “she” was the most common choice in every role, which is still an unrequested assumption. Guardrails raised neutral “they” from ${pOff.they} to ${pOn.they} of ${pOn.n} drafts. Recommendation letters written from identical evidence with a changed name or age showed ${a.letters.filter((l) => l.agenticNotable || l.communalNotable).length} of ${a.letters.length} comparisons with a gap beyond run-to-run variation, but with ${results.bias.runs.letters} letters per group this cannot show bias to be absent.</li>
  <li><b>Over-trust in automatic checks.</b> One email addressed “Professor Smith”, a name nobody supplied, and still scored 100 on adherence. Scores should direct human attention, not replace it.</li>
  <li><b>Over-refusal.</b> Without guardrails, the model refused all MMR requests, even though a parents' committee would benefit from the evidence. With them it usually wrote the correction.</li>
  <li><b>Privacy.</b> Briefs go to a model provider, and checks send text to Wikipedia search and Voyage AI, so confidential content should not be used.</li>
</ul>
<p>Limitations: no person labelled the drafts, so agreement with human judgement was not measured; sample sizes are small, so results show direction rather than firm rates; and evidence is limited to Wikipedia.</p>

<h2>8. Conclusion</h2>
<p>DraftLab meets the problem statement: it generates all four document types from a structured brief, supports revision with version comparison, and evaluates all five quality measures. We learned that generating fluent text is the easy part. The harder and more valuable work is finding out whether that text can be trusted, and testing the evaluator itself showed where automatic scores are reliable and where they are not. Prompt guardrails helped considerably, but invented details, unverifiable claims, and biased assumptions still occurred. The solution helps users write faster and shows them where to look, but a person must still verify names, figures, and citations before relying on any draft. Future work includes human-labelled evaluation, larger samples, better evidence retrieval, and citation lookup against scholarly databases.</p>

<h2>9. References</h2>
<ol class="refs">
  <li>OpenAI (2025). gpt-oss-120b and gpt-oss-20b Model Card. https://openai.com/index/gpt-oss-model-card/</li>
  <li>Madera, J. M., Hebl, M. R., &amp; Martin, R. C. (2009). Gender and letters of recommendation for academia: Agentic and communal differences. <i>Journal of Applied Psychology</i>, 94(6), 1591–1599.</li>
  <li>Ji, Z., et al. (2023). Survey of hallucination in natural language generation. <i>ACM Computing Surveys</i>, 55(12), 1–38.</li>
  <li>Bender, E. M., Gebru, T., McMillan-Major, A., &amp; Shmitchell, S. (2021). On the dangers of stochastic parrots. <i>Proceedings of ACM FAccT 2021</i>, 610–623.</li>
  <li>Robertson, S., &amp; Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. <i>Foundations and Trends in Information Retrieval</i>, 3(4), 333–389.</li>
  <li>Flesch, R. (1948). A new readability yardstick. <i>Journal of Applied Psychology</i>, 32(3), 221–233.</li>
  <li>“Your LLM-as-judge is lying to you”, DEV Community. https://dev.to/loopandretry/your-llm-as-judge-is-lying-to-you-gg9</li>
  <li>“If you let an AI do the scoring, start by doubting the scores”, DEV Community. https://dev.to/lyr/if-you-let-an-ai-do-the-scoring-start-by-doubting-the-scores-1pag</li>
  <li>Documentation: Next.js (nextjs.org/docs), Voyage AI (docs.voyageai.com), MediaWiki Action API (mediawiki.org/wiki/API:Main_page), and Amazon Bedrock (docs.aws.amazon.com/bedrock).</li>
</ol>
</body></html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: "docs/report.pdf",
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;text-align:center;font-family:'Times New Roman',serif;font-size:10pt"><span class="pageNumber"></span></div>`,
  });
  await browser.close();
  console.log("Wrote docs/report.pdf");
}

main();
