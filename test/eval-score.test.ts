import { describe, expect, it } from "vitest";
import { scoreArticle, stability, summarize, type CorpusArticle } from "../eval/score";
import type { Annotation } from "../src/schema";

const TEXT = "Le titre promet tout. Les prix ont doublé en dix ans. Ceux qui doutent sont des menteurs. La pluie tombe.";

const article: CorpusArticle = {
  id: "a",
  title: "T",
  lang: "fr",
  kind: "synthetic",
  license: { name: "MIT", redistributable: true },
  document: { clickbait_gap: "present", blind_spot: "any" },
  limits: { max_rhetorical: 1 },
  expected: [
    { quote: "Les prix ont doublé en dix ans.", accept: ["factual_claim/statistique"], required: true, fact_status: ["refuted", "unverified"] },
    { quote: "Ceux qui doutent sont des menteurs.", accept: ["sophism/ad_hominem"], required: true },
    { quote: "Le titre promet tout.", accept: ["bias/cadrage"], required: false },
  ],
  not_expected: [{ quote: "La pluie tombe." }],
};

const ann = (quote: string, category: Annotation["category"], label: string, status: Annotation["fact_check"]["status"] = "unverified"): Annotation => ({
  id: quote,
  exact_quote: quote,
  category,
  label,
  severity: "medium",
  rhetoric_critique: "",
  fact_check: { status, context: "", sources: [] },
});

describe("scoreArticle (Q1)", () => {
  it("compte rappel, précision, statut factuel et éléments globaux", () => {
    const score = scoreArticle(
      article,
      {
        summary: "",
        clickbait_gap: "Le titre exagère.",
        annotations: [
          ann("prix ont doublé en dix ans", "factual_claim", "statistique", "supported"),
          ann("Ceux qui doutent sont des menteurs", "bias", "cadrage"),
          ann("Le titre promet tout", "bias", "cadrage"),
          ann("La pluie tombe", "bias", "cadrage"),
          ann("Phrase inventée", "sophism", "autre"),
        ],
      },
      TEXT,
    );
    expect(score.byCategory.factual_claim).toEqual({ required: 1, found: 1 });
    expect(score.byCategory.sophism).toEqual({ required: 1, found: 0 });
    expect(score.foundRequired).toEqual([0]);
    expect(score.matched).toBe(3);
    expect(score.located).toBe(4);
    expect(score.factChecked).toBe(1);
    expect(score.factCorrect).toBe(0);
    expect(score.documentCorrect).toBe(1);
    expect(score.issues.map((i) => i.kind).sort()).toEqual(
      ["fact_status", "false_positive", "limit", "mislabeled", "not_expected", "unlocated"].sort(),
    );
  });

  it("signale les annotations requises manquées et un élément global attendu absent", () => {
    const score = scoreArticle(article, { summary: "", annotations: [] }, TEXT);
    expect(score.issues.filter((i) => i.kind === "missed")).toHaveLength(2);
    expect(score.issues.some((i) => i.kind === "document")).toBe(true);
  });
});

describe("stability et summarize (Q1)", () => {
  it("mesure la part des annotations requises au résultat constant", () => {
    const run = (found: Annotation[]) => scoreArticle(article, { summary: "", annotations: found }, TEXT);
    const r1 = run([ann("Les prix ont doublé en dix ans.", "factual_claim", "statistique")]);
    const r2 = run([]);
    expect(stability([r1, r1])).toBe(1);
    expect(stability([r1, r2])).toBe(0.5);
    expect(stability([r1])).toBeNull();
    const s = summarize([r1, r2], [{ ...article, control: true }]);
    expect(s.byCategory.factual_claim).toEqual({ required: 2, found: 1 });
    expect(s.controlRhetorical).toBe(0);
  });
});
