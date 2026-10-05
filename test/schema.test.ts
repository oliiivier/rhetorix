import { describe, expect, it } from "vitest";
import {
  SchemaError,
  enforceFactCheckSourcePolicy,
  enforceSourcePolicy,
  isDocumentLevel,
  isVerifiable,
  normalizeDoi,
  validateAnalysis,
  validateFactCheck,
} from "../src/schema";

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

  it("extrait et nettoie clickbait_gap et blind_spot quand présents", () => {
    const a = validateAnalysis({
      summary: "s",
      clickbait_gap: "  Titre sensationnaliste  ",
      blind_spot: "  Absence de point de vue contradictoire  ",
      annotations: [annotation()],
    });
    expect(a.clickbait_gap).toBe("Titre sensationnaliste");
    expect(a.blind_spot).toBe("Absence de point de vue contradictoire");
  });

  it("gère l'absence de clickbait_gap et blind_spot gracieusement", () => {
    const a = validateAnalysis({ summary: "s", annotations: [annotation()] });
    expect(a.clickbait_gap).toBe("");
    expect(a.blind_spot).toBe("");
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

describe("confiance (Q3)", () => {
  it("garde une confiance valide et omet une valeur absente ou inconnue", () => {
    const a = validateAnalysis({
      summary: "s",
      annotations: [annotation({ confidence: "low" }), annotation({ id: "ann-2" }), annotation({ id: "ann-3", confidence: "certaine" })],
    });
    expect(a.annotations.map((x) => x.confidence)).toEqual(["low", undefined, undefined]);
    expect("confidence" in a.annotations[1]!).toBe(false);
  });
});

describe("annotations d'ensemble (B3)", () => {
  it("accepte une citation vide pour un sophisme ou un biais", () => {
    const a = validateAnalysis({ summary: "s", annotations: [annotation({ exact_quote: "  " }), annotation({ id: "ann-2", category: "bias", label: "autre", exact_quote: "" })] });
    expect(a.annotations.map(isDocumentLevel)).toEqual([true, true]);
  });

  it("rejette une allégation factuelle sans citation", () => {
    expect(() => validateAnalysis({ summary: "s", annotations: [annotation({ category: "factual_claim", label: "autre", exact_quote: "" })] })).toThrow(SchemaError);
  });
});

describe("vérification à la demande (C2)", () => {
  const unverified = { status: "unverified" as const, context: "", sources: [] };

  it("isVerifiable : allégation de passage restée non vérifiée", () => {
    expect(isVerifiable({ category: "factual_claim", exact_quote: "x", fact_check: unverified })).toBe(true);
    expect(isVerifiable({ category: "factual_claim", exact_quote: "x", fact_check: { ...unverified, status: "refuted" } })).toBe(false);
    expect(isVerifiable({ category: "sophism", exact_quote: "x", fact_check: unverified })).toBe(false);
  });

  it("validateFactCheck et enforceFactCheckSourcePolicy appliquent D3 à une vérification seule", () => {
    const fc = validateFactCheck({ status: "refuted", context: "c", sources: [{ title: "a", url: "https://a.test/x#y" }, { title: "b", url: "https://b.test/" }] });
    expect(enforceFactCheckSourcePolicy(fc, new Set(["https://a.test/x"]))).toEqual({
      status: "refuted",
      context: "c",
      sources: [{ title: "a", url: "https://a.test/x#y" }],
    });
    expect(enforceFactCheckSourcePolicy(fc, new Set()).status).toBe("unverified");
  });
});

describe("niveau de preuve (D16)", () => {
  const fc = (evidence: unknown) => validateFactCheck({ status: "supported", context: "", sources: [], evidence });

  it("garde le type d'étude et normalise le DOI", () => {
    expect(fc({ kind: "rct", doi: "https://doi.org/10.1056/NEJMoa2034577." })).toMatchObject({ evidence: { kind: "rct", doi: "10.1056/NEJMoa2034577" } });
    expect(fc({ kind: "observational", doi: "pas un doi" }).evidence).toEqual({ kind: "observational" });
  });

  it("omet un niveau de preuve absent, « none » ou inconnu", () => {
    expect("evidence" in fc({ kind: "none", doi: "" })).toBe(false);
    expect("evidence" in fc(undefined)).toBe(false);
    expect("evidence" in fc({ kind: "anecdote" })).toBe(false);
  });

  it("retire le DOI sans recherche web, garde le type d'étude", () => {
    const checked = enforceFactCheckSourcePolicy(fc({ kind: "meta_analysis", doi: "10.1000/x" }), undefined);
    expect(checked.evidence).toEqual({ kind: "meta_analysis" });
    expect(enforceFactCheckSourcePolicy(fc({ kind: "meta_analysis", doi: "10.1000/x" }), new Set()).evidence).toEqual({ kind: "meta_analysis", doi: "10.1000/x" });
  });

  it("normalizeDoi rejette ce qui n'est pas un DOI", () => {
    expect(normalizeDoi("doi: 10.1000/xyz123")).toBe("10.1000/xyz123");
    expect(normalizeDoi("10.10/x")).toBeUndefined();
  });
});
