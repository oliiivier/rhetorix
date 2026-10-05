import { describe, expect, it } from "vitest";
import { chunkParagraphs, dedupeAnnotations, mapSettled, mergeAnalyses, quotesOverlap } from "../src/chunking";
import type { Analysis, Annotation } from "../src/schema";

describe("chunkParagraphs", () => {
  it("regroupe sans dépasser la limite", () => {
    const p = "x".repeat(400); // ~100 tokens
    expect(chunkParagraphs([p, p, p, p, p], 250)).toHaveLength(3);
  });

  it("garde un paragraphe trop long dans son propre morceau", () => {
    expect(chunkParagraphs(["a", "y".repeat(4000), "b"], 100)).toHaveLength(3);
  });
});

describe("mergeAnalyses", () => {
  const ann = (quote: string): Annotation => ({
    id: "ann-1",
    exact_quote: quote,
    category: "bias",
    label: "cadrage",
    severity: "low",
    rhetoric_critique: "",
    fact_check: { status: "unverified", context: "", sources: [] },
  });

  it("renumérote et dédoublonne", () => {
    const parts: Analysis[] = [
      { summary: "A", annotations: [ann("q1"), ann("q2")] },
      { summary: "B", annotations: [ann("Q2"), ann("q3")] },
    ];
    const merged = mergeAnalyses(parts);
    expect(merged.annotations.map((a) => [a.id, a.exact_quote])).toEqual([
      ["ann-1", "q1"],
      ["ann-2", "q2"],
      ["ann-3", "q3"],
    ]);
    expect(merged.summary).toBe("A\n\nB");
  });

  it("fusionne clickbait_gap et blind_spot sans duplication", () => {
    const parts: Analysis[] = [
      { summary: "A", clickbait_gap: "Titre trompeur", blind_spot: "Point A", annotations: [] },
      { summary: "B", clickbait_gap: "", blind_spot: "Point B", annotations: [] },
      { summary: "C", clickbait_gap: "Autre", blind_spot: "Point A", annotations: [] },
    ];
    const merged = mergeAnalyses(parts);
    expect(merged.clickbait_gap).toBe("Titre trompeur");
    expect(merged.blind_spot).toBe("Point A\n\nPoint B");
  });
});

describe("quotesOverlap (A5)", () => {
  it("détecte une citation contenue dans l'autre, à la typographie près", () => {
    expect(quotesOverlap("« Le nucléaire est sûr. »", "Tout le monde le sait : le nucléaire est sûr")).toBe(true);
  });

  it("détecte un recouvrement de la fin de l'une sur le début de l'autre", () => {
    expect(quotesOverlap("Les prix ont doublé en dix ans", "ont doublé en dix ans, selon l'Insee")).toBe(true);
  });

  it("ignore un recouvrement marginal", () => {
    expect(quotesOverlap("Les prix ont doublé en dix ans", "en dix ans, la population a changé")).toBe(false);
    expect(quotesOverlap("première phrase", "seconde phrase")).toBe(false);
  });
});

describe("dedupeAnnotations (A5)", () => {
  const ann = (id: string, quote: string, category: Annotation["category"], severity: Annotation["severity"]): Annotation => ({
    id,
    exact_quote: quote,
    category,
    label: "autre",
    severity,
    rhetoric_critique: "",
    fact_check: { status: "unverified", context: "", sources: [] },
  });

  it("garde la plus sévère de deux annotations de même catégorie qui se recouvrent, à la place de la première", () => {
    const out = dedupeAnnotations([
      ann("a", "Les prix ont doublé en dix ans", "bias", "low"),
      ann("b", "Autre passage", "bias", "low"),
      ann("c", "prix ont doublé en dix ans", "bias", "high"),
    ]);
    expect(out.map((a) => a.id)).toEqual(["c", "b"]);
  });

  it("garde deux catégories différentes sur un même passage, sauf citation identique", () => {
    const out = dedupeAnnotations([
      ann("a", "Les prix ont doublé en dix ans", "bias", "low"),
      ann("b", "prix ont doublé", "factual_claim", "medium"),
      ann("c", "les prix ont doublé en dix ans", "sophism", "high"),
    ]);
    expect(out.map((a) => a.id)).toEqual(["c", "b"]);
  });
});

describe("mapSettled (A3)", () => {
  it("borne la concurrence et conserve l'ordre", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapSettled([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    });
    expect(out.map((r) => (r.ok ? r.value : null))).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("isole les échecs", async () => {
    const out = await mapSettled([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(out.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it("ne lance plus rien après une annulation", async () => {
    const controller = new AbortController();
    const calls: number[] = [];
    const out = await mapSettled(
      [1, 2, 3, 4],
      1,
      async (n) => {
        calls.push(n);
        if (n === 2) controller.abort();
        return n;
      },
      controller.signal,
    );
    expect(calls).toEqual([1, 2]);
    expect(out.map((r) => r.ok)).toEqual([true, true, false, false]);
  });
});
