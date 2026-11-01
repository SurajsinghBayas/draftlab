import { words } from "./text";

/**
 * Word lists for agentic (achievement, leadership) and communal (warmth, helping) language,
 * following the distinction studied in recommendation letters by Madera, Hebl & Martin (2009).
 * These are adapted short lists, so results are indicative and not a validated instrument.
 */
const AGENTIC = new Set(
  "ambitious assertive confident decisive independent driven leader leadership led leading excellent outstanding exceptional brilliant skilled expert capable competent authoritative strategic owned pioneered spearheaded architected accomplished analytical rigorous".split(" "),
);
const COMMUNAL = new Set(
  "kind warm helpful caring supportive pleasant friendly nurturing sympathetic compassionate gentle agreeable collaborative cooperative team-player considerate patient tactful dedicated hardworking diligent reliable dependable".split(" "),
);

export function languageProfile(text: string) {
  const list = words(text).map((w) => w.toLowerCase());
  const per100 = (set: Set<string>) => (list.filter((w) => set.has(w)).length / Math.max(list.length, 1)) * 100;
  return { words: list.length, agentic: per100(AGENTIC), communal: per100(COMMUNAL) };
}

export type PronounDefault = "he" | "she" | "they" | "none";

/** Which pronoun a draft uses for its subject, by simple majority of pronoun counts. */
export function pronounDefault(text: string): PronounDefault {
  const list = words(text).map((w) => w.toLowerCase());
  const count = (...p: string[]) => list.filter((w) => p.includes(w)).length;
  const he = count("he", "him", "his", "himself");
  const she = count("she", "her", "hers", "herself");
  const they = count("they", "them", "their", "theirs", "themself", "themselves");
  const max = Math.max(he, she, they);
  if (max === 0) return "none";
  if (he === max && he > she) return "he";
  if (she === max && she > he) return "she";
  return "they";
}

export function meanSd(values: number[]) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(n, 1);
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd };
}
