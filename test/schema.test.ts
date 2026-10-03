import { describe, expect, it } from "vitest";
import { SchemaError, enforceSourcePolicy, validateAnalysis } from "../src/schema";

const annotation = (over: Record<string, unknown> = {}) => ({
  id: "ann-1",
  exact_quote: " une citation ",
  category: "sophism",
  label: "faux_dilemme",
  severity: "high",
  rhetoric_critique: "…",
  fact_check: { status: "supported", context: "", sources: [{ title: "Source", url: "https://example.org/a#x" }] },
  ...over,
});

describe("validateAnalysis", () => {
  it("accepte une sortie conforme et nettoie la citation", () => {
    const a = validateAnalysis({ summary: "s", annotations: [annotation()] });
    expect(a.annotations[0]!.exact_quote).toBe("une citation");
  });

  it("ramène un label hors catégorie à « autre »", () => {
    const a = validateAnalysis({ summary: "s", annotations: [annotation({ category: "bias", label: "faux_dilemme" })] });
    expect(a.annotations[0]!.label).toBe("autre");
  });

  it("retire les URL non http(s)", () => {
    const a = validateAnalysis({
      summary: "s",
      annotations: [annotation({ fact_check: { status: "supported", context: "", sources: [{ title: "x", url: "javascript:alert(1)" }] } })],
    });
    expect(a.annotations[0]!.fact_check.sources).toEqual([]);
  });

  it("rejette une catégorie inconnue", () => {
    expect(() => validateAnalysis({ summary: "s", annotations: [annotation({ category: "opinion" })] })).toThrow(SchemaError);
  });
});

describe("enforceSourcePolicy (D3)", () => {
  const analysis = validateAnalysis({ summary: "s", annotations: [annotation()] });

  it("sans recherche web : aucune source, statut non vérifié", () => {
    const fc = enforceSourcePolicy(analysis, undefined).annotations[0]!.fact_check;
    expect(fc).toMatchObject({ status: "unverified", sources: [] });
  });

  it("ne garde que les URL issues de la recherche", () => {
    expect(enforceSourcePolicy(analysis, new Set(["https://example.org/a"])).annotations[0]!.fact_check.sources).toHaveLength(1);
    expect(enforceSourcePolicy(analysis, new Set(["https://other.org/"])).annotations[0]!.fact_check).toMatchObject({
      status: "unverified",
      sources: [],
    });
  });
});
