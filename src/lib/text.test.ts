import { describe, expect, it } from "vitest";
import { languageProfile, pronounDefault } from "./bias";
import { FORMAT_CHECKS } from "./evaluate/adherence";
import { factualScore } from "./evaluate/factual";
import { grammarScore } from "./evaluate/grammar";
import { originalityScore } from "./evaluate/originality";
import { rankBm25 } from "./retrieval";
import { buildGenerateMessages } from "./prompts";
import { extractFigures, lengthScore, lintMechanics, paragraphs, placeholders, quoteExists, stockPhrases, stripMarkdown, verbatimOverlap, wordCount } from "./text";
import { DraftInputSchema, targetWords } from "./types";

describe("wordCount", () => {
  it("ignores Markdown syntax and counts words", () => {
    expect(wordCount("# Title here\n\n- **bold** word\n- [a link](http://x.y) too")).toBe(7);
  });
  it("keeps decimals and hyphenated words as one word", () => {
    expect(wordCount("It rose 1.2 degrees in well-known areas.")).toBe(7);
  });
});

describe("paragraphs", () => {
  it("keeps body text that sits directly under a heading", () => {
    const md = "# Title\n\n## Section one\nThis body text sits right under its heading with no blank line.\n\n## Two\nAnother body paragraph that is long enough to count here.";
    expect(paragraphs(md)).toHaveLength(2);
  });
  it("drops the email subject line", () => {
    expect(paragraphs("**Subject:** A long subject line with quite a few words in it\n\nDear team, this is the body of the email message.")).toHaveLength(1);
  });
});

describe("extractFigures", () => {
  it("normalizes thousands and ignores placeholders and list numbers", () => {
    expect(extractFigures("1. Revenue was 1,200 and [insert 2024 figure] rose 3.5%.").sort()).toEqual(["1200", "3.5"]);
  });
  it("ignores digits inside words", () => {
    expect(extractFigures("Q3 and CO2 levels")).toEqual([]);
  });
});

describe("quoteExists", () => {
  it("matches across curly quotes, emphasis, and spacing", () => {
    expect(quoteExists("the team’s   report", "As **the team's report** says")).toBe(true);
  });
  it("rejects an invented quote and an empty one", () => {
    expect(quoteExists("never said this", "something else entirely")).toBe(false);
    expect(quoteExists("", "anything")).toBe(false);
  });
});

describe("verbatimOverlap", () => {
  const corpus = "the quick brown fox jumps over the lazy dog near the old river bank";
  it("detects a copied run", () => {
    const r = verbatimOverlap("He wrote that the quick brown fox jumps over the lazy dog today", corpus);
    expect(r.longestWords).toBe(9);
    expect(r.containment).toBeGreaterThan(0.3);
  });
  it("finds nothing in independent text", () => {
    expect(verbatimOverlap("Completely different sentence about monetary policy and interest rates this year", corpus).containment).toBe(0);
  });
  it("does not count text the user supplied", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    expect(verbatimOverlap(text, corpus, text).containment).toBe(0);
  });
});

describe("lintMechanics", () => {
  it("flags a repeated word and a missing space", () => {
    const rules = lintMechanics("This is the the end,of it.").map((i) => i.rule);
    expect(rules).toContain("Repeated word");
    expect(rules).toContain("Missing space after punctuation");
  });
  it("passes clean text", () => {
    expect(lintMechanics("This is a clean sentence, and it has a useful point.")).toEqual([]);
  });
});

describe("placeholders and stock phrases", () => {
  it("counts placeholders but not Markdown links", () => {
    expect(placeholders("Revenue was [insert Q3 revenue]. See [docs](http://a.b).")).toEqual(["[insert Q3 revenue]"]);
  });
  it("finds stock phrases across curly apostrophes", () => {
    expect(stockPhrases("In today’s fast-paced market, we delve into it.")).toEqual(["in today's fast-paced", "delve into"]);
  });
});

describe("scoring formulas", () => {
  it("length is full credit within 15% and zero at 60% off", () => {
    expect(lengthScore(110, 100)).toBe(100);
    expect(lengthScore(160, 100)).toBe(0);
    expect(lengthScore(40, 100)).toBe(0);
    expect(lengthScore(130, 100)).toBeGreaterThan(50);
  });
  it("grammar loses 20 points per error per 100 words", () => {
    expect(grammarScore(0, 100)).toBe(100);
    expect(grammarScore(1, 100)).toBe(80);
    expect(grammarScore(10, 100)).toBe(0);
  });
  it("factual reports null with nothing to check, and punishes contradictions", () => {
    expect(factualScore({ supported: 0, unverified: 0, contradicted: 0, internal: 0, unsourcedFigures: 0 })).toBeNull();
    expect(factualScore({ supported: 4, unverified: 0, contradicted: 0, internal: 0, unsourcedFigures: 0 })).toBe(100);
    expect(factualScore({ supported: 3, unverified: 0, contradicted: 1, internal: 0, unsourcedFigures: 0 })).toBe(45);
    expect(factualScore({ supported: 0, unverified: 4, contradicted: 0, internal: 0, unsourcedFigures: 0 })).toBe(50);
  });
  it("originality reaches zero at 25% verbatim copying", () => {
    expect(originalityScore({ containment: 0, paraphraseShare: 0, stockPer100: 0 })).toBe(100);
    expect(originalityScore({ containment: 0.25, paraphraseShare: 0, stockPer100: 0 })).toBe(0);
  });
});

describe("format checks", () => {
  const passes = (type: keyof typeof FORMAT_CHECKS, md: string) => FORMAT_CHECKS[type].filter((c) => !c.test(md)).map((c) => c.label);
  it("accepts a well-formed email", () => {
    expect(passes("email", "**Subject:** Hello there\n\nDear Dr. Rao,\n\nPlease see the note.\n\nBest regards,\n[Your Name]")).toEqual([]);
  });
  it("flags an email with no subject or sign-off", () => {
    const failed = passes("email", "Dear Dr. Rao,\n\nPlease see the note.");
    expect(failed).toContain("Has a subject line");
    expect(failed).toContain("Has a sign-off");
  });
  it("flags a report with no sections", () => {
    expect(passes("report", "Just one paragraph of text.")).toHaveLength(4);
  });
});

describe("rankBm25", () => {
  it("ranks the relevant paragraph first and drops non-matches", () => {
    const docs = ["Cats sleep most of the day.", "The photoelectric effect earned Einstein the Nobel Prize.", "Bread needs yeast."];
    expect(rankBm25("Einstein Nobel Prize", docs, 3)).toEqual([1]);
  });
});

describe("bias measures", () => {
  it("finds the majority pronoun", () => {
    expect(pronounDefault("She said her plan worked and she left.")).toBe("she");
    expect(pronounDefault("He said his plan worked.")).toBe("he");
    expect(pronounDefault("They said their plan worked.")).toBe("they");
    expect(pronounDefault("The plan worked.")).toBe("none");
  });
  it("rates agentic and communal language per 100 words", () => {
    const p = languageProfile("A decisive and ambitious leader who is also kind");
    expect(p.agentic).toBeGreaterThan(p.communal);
    expect(p.communal).toBeGreaterThan(0);
  });
});

describe("briefs and prompts", () => {
  const base = { contentType: "report", topic: "A topic", audience: "Readers", tone: "Neutral", length: "short" };
  it("resolves word targets by type and length", () => {
    expect(targetWords(DraftInputSchema.parse(base))).toBe(200);
    expect(targetWords(DraftInputSchema.parse({ ...base, length: "custom", customWords: 333 }))).toBe(333);
  });
  it("rejects an empty topic", () => {
    expect(DraftInputSchema.safeParse({ ...base, topic: " " }).success).toBe(false);
  });
  it("can switch guardrails off only by explicit option", () => {
    const input = DraftInputSchema.parse(base);
    expect(buildGenerateMessages(input)[0].content).toContain("Never invent specifics");
    expect(buildGenerateMessages(input, { guardrails: false })[0].content).not.toContain("Never invent specifics");
  });
  it("strips Markdown tokens", () => {
    expect(stripMarkdown("## Head\n**bold** `code`").trim()).toBe("Head\nbold code");
  });
});
