/** Outside evidence (Wikipedia), local ranking, and embeddings (Voyage). Used only by the evaluator. */

export const EMBED_MODEL = "voyage-4";
const VOYAGE = "https://api.voyageai.com/v1";
const WIKI = "https://en.wikipedia.org/w/api.php";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WIKI_HEADERS = { "User-Agent": "DraftLab/0.1 (student prototype evaluating generated text)" };

export interface Article {
  title: string;
  url: string;
  text: string;
}

/**
 * Wikipedia rate-limits anonymous clients hard (429 with retry-after of about 25s after a burst).
 * Requests go one at a time, spaced out, and each search returns several intros at once.
 */
const WIKI_SPACING_MS = 500;
let wikiQueue: Promise<unknown> = Promise.resolve();
function wikiGet(params: URLSearchParams): Promise<WikiResponse> {
  const run = async (): Promise<WikiResponse> => {
    await sleep(WIKI_SPACING_MS);
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${WIKI}?${params}`, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return res.json();
      if (attempt >= 2 || (res.status !== 429 && res.status < 500)) throw new Error(`Wikipedia returned ${res.status}`);
      await sleep(Math.min(Number(res.headers.get("retry-after")) || 5, 30) * 1000);
    }
  };
  const result = wikiQueue.then(run, run);
  wikiQueue = result.catch(() => undefined);
  return result;
}

interface WikiResponse {
  query?: { pages?: Record<string, { title?: string; extract?: string; index?: number }> };
}

const toArticle = (title: string, text: string): Article => ({
  title,
  url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  text,
});

const searchCache = new Map<string, Promise<Article[]>>();

/** One request returns the lead sections of the top results, most relevant first. */
export function searchArticles(query: string, limit = 3): Promise<Article[]> {
  const key = `${limit}:${query}`;
  const cached = searchCache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query.slice(0, 280),
    gsrlimit: String(limit),
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exlimit: "max",
    format: "json",
  });
  const pending = wikiGet(params).then((d) =>
    Object.values(d.query?.pages ?? {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .filter((p) => p.title && p.extract)
      .map((p) => toArticle(p.title!, p.extract!)),
  );
  searchCache.set(key, pending);
  pending.catch(() => searchCache.delete(key));
  return pending;
}

const fullCache = new Map<string, Promise<Article | null>>();

/** The whole article, used once per evaluation for the copied-text check. */
export function fetchFullArticle(title: string): Promise<Article | null> {
  const cached = fullCache.get(title);
  if (cached) return cached;
  const params = new URLSearchParams({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title, format: "json" });
  const pending = wikiGet(params).then((d) => {
    const page = Object.values(d.query?.pages ?? {})[0];
    return page?.extract ? toArticle(page.title ?? title, page.extract) : null;
  });
  fullCache.set(title, pending);
  pending.catch(() => fullCache.delete(title));
  return pending;
}

export function splitParagraphs(article: Article): { title: string; url: string; text: string }[] {
  return article.text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 15 && !p.startsWith("=="))
    .map((text) => ({ title: article.title, url: article.url, text }));
}

/**
 * Voyage allows 3 requests a minute on an account with no payment method on file, even with free
 * tokens left. Calls go through one paced queue. Set VOYAGE_MIN_INTERVAL_MS=0 once billing is added.
 */
const VOYAGE_INTERVAL = Number(process.env.VOYAGE_MIN_INTERVAL_MS ?? 21_000);
let voyageQueue: Promise<unknown> = Promise.resolve();
let voyageLast = 0;

function voyageEmbed(input: string[], inputType: string): Promise<number[][]> {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      await sleep(Math.max(0, voyageLast + VOYAGE_INTERVAL - Date.now()));
      voyageLast = Date.now();
      const res = await fetch(`${VOYAGE}/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${voyageKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input, model: EMBED_MODEL, input_type: inputType }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const d = (await res.json()) as { data: { embedding: number[]; index: number }[] };
        return [...d.data].sort((a, b) => a.index - b.index).map((x) => x.embedding);
      }
      if (attempt >= 3 || (res.status !== 429 && res.status < 500)) throw new Error(`Voyage embeddings failed with status ${res.status}`);
    }
  };
  const result = voyageQueue.then(run, run);
  voyageQueue = result.catch(() => undefined);
  return result;
}

function voyageKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

const vectorCache = new Map<string, number[]>();

/** Only texts not seen before reach the API, so coherence and originality share draft vectors. */
export async function embed(texts: string[]): Promise<number[][]> {
  const clipped = texts.map((t) => t.slice(0, 1500));
  const missing = [...new Set(clipped.filter((t) => !vectorCache.has(t)))];
  if (missing.length) {
    const vectors = await voyageEmbed(missing, "document");
    missing.forEach((t, i) => vectorCache.set(t, vectors[i]));
  }
  return clipped.map((t) => vectorCache.get(t)!);
}

const STOP = new Set("the a an and or of to in on for with by at from as is are was were be been that this it its their his her not".split(" "));
const terms = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w));

/** BM25 ranking. Local and deterministic. Returns document indexes, best first, dropping non-matches. */
export function rankBm25(query: string, documents: string[], topK: number): number[] {
  const docs = documents.map(terms);
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
  const qTerms = [...new Set(terms(query))];
  const df = new Map(qTerms.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
  return docs
    .map((doc, index) => {
      let score = 0;
      for (const t of qTerms) {
        const tf = doc.filter((w) => w === t).length;
        if (!tf) continue;
        const idf = Math.log(1 + (docs.length - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
        score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * doc.length) / (avgLen || 1)));
      }
      return { index, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.index);
}
