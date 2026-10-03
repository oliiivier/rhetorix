import { describe, expect, it } from "vitest";
import { chunkParagraphs, mapLimit, mergeAnalyses } from "../src/chunking";
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

describe("mapLimit", () => {
  it("borne la concurrence et conserve l'ordre", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
