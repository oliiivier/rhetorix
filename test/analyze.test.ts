import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type Config } from "../src/config";
import type { Extracted } from "../src/messages";
import type { Annotation } from "../src/schema";

const mockAnalyze = vi.fn();
const mockConsolidate = vi.fn();
const mockSupportsWebSearch = vi.fn();

vi.mock("../src/providers/openai-compatible", () => ({
  openAiCompatibleProvider: {
    supportsWebSearch: (config: Config) => mockSupportsWebSearch(config),
    analyze: (...args: unknown[]) => mockAnalyze(...args),
    complete: (...args: unknown[]) => mockConsolidate(...args),
  },
}));

// Doit être importé après vi.mock
const { analyzeArticle, quoteContext } = await import("../src/analyze");

describe("analyzeArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupportsWebSearch.mockReturnValue(false);
  });

  const baseConfig: Config = {
    ...DEFAULT_CONFIG,
    provider: "openai-compatible",
    apiKey: "test-key",
    model: "test-model",
    endpoint: "https://api.test/v1",
    language: "fr",
    webSearch: false,
    maxChunkTokens: 50, // petit seuil pour forcer le découpage si nécessaire
    displayMode: "both",
  };

  it("analyse un article court en un seul morceau", async () => {
    mockAnalyze.mockResolvedValueOnce({
      raw: {
        summary: "Résumé unique",
        annotations: [
          {
            id: "raw-1",
            exact_quote: "citation valide",
            category: "sophism",
            label: "ad_hominem",
            severity: "high",
            rhetoric_critique: "Attaque personnelle",
            fact_check: { status: "unverified", context: "", sources: [] },
          },
        ],
      },
    });

    const article: Extracted = {
      title: "Titre court",
      lang: "fr",
      paragraphs: ["Premier court paragraphe."],
    };

    const progressCalls: Array<{ phase?: string; done: number; total: number }> = [];
    const controller = new AbortController();

    const result = await analyzeArticle(article, baseConfig, controller.signal, {
      onProgress: (p) => {
        progressCalls.push(p);
      },
    });

    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    expect(mockConsolidate).not.toHaveBeenCalled();
    expect(result.summary).toBe("Résumé unique");
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]!.id).toBe("ann-1");
    expect(progressCalls).toEqual([
      { phase: "analyzing", done: 0, total: 1 },
      { phase: "analyzing", done: 1, total: 1 },
    ]);
  });

  it("découpe un article long, fusionne les annotations et consolide le résumé", async () => {
    mockAnalyze
      .mockResolvedValueOnce({
        raw: {
          summary: "Résumé partie 1",
          annotations: [
            {
              id: "p1-1",
              exact_quote: "citation un",
              category: "sophism",
              label: "homme_de_paille",
              severity: "medium",
              rhetoric_critique: "Critique 1",
              fact_check: { status: "unverified", context: "", sources: [] },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        raw: {
          summary: "Résumé partie 2",
          annotations: [
            {
              id: "p2-1",
              exact_quote: "citation deux",
              category: "bias",
              label: "cadrage",
              severity: "low",
              rhetoric_critique: "Critique 2",
              fact_check: { status: "unverified", context: "", sources: [] },
            },
          ],
        },
      });

    mockConsolidate.mockResolvedValueOnce(
      '```json\n{"summary": "Résumé consolidé global.", "clickbait_gap": "Titre exagéré.", "blind_spot": ""}\n```',
    );

    const article: Extracted = {
      title: "Grand article",
      lang: "fr",
      // Deux longs paragraphes qui dépassent maxChunkTokens (50 tokens = ~200 chars)
      paragraphs: ["A".repeat(300), "B".repeat(300)],
    };

    const progressCalls: Array<{ phase?: string; done: number; total: number }> = [];
    const controller = new AbortController();

    const result = await analyzeArticle(article, baseConfig, controller.signal, {
      onProgress: (p) => {
        progressCalls.push(p);
      },
    });

    expect(mockAnalyze).toHaveBeenCalledTimes(2);
    // Mode rapide : un seul appel supplémentaire, la consolidation (B2).
    expect(mockConsolidate).toHaveBeenCalledTimes(1);
    const [request, config, signal] = mockConsolidate.mock.calls[0]!;
    expect(request.json).toBe(true);
    expect(request.user).toContain("Section 1 summary: Résumé partie 1");
    expect(request.user).toContain("Section 2 summary: Résumé partie 2");
    expect(config).toBe(baseConfig);
    expect(signal).toBe(controller.signal);
    expect(result.summary).toBe("Résumé consolidé global.");
    expect(result.clickbait_gap).toBe("Titre exagéré.");
    expect(result.blind_spot).toBe("");
    expect(result.annotations).toHaveLength(2);
    expect(result.annotations[0]!.id).toBe("ann-1");
    expect(result.annotations[1]!.id).toBe("ann-2");

    expect(progressCalls).toContainEqual({ phase: "consolidating", done: 2, total: 2 });
  });

  it("se replie sur le résumé concaténé si la consolidation échoue", async () => {
    mockAnalyze
      .mockResolvedValueOnce({
        raw: {
          summary: "Résumé partie 1",
          annotations: [],
        },
      })
      .mockResolvedValueOnce({
        raw: {
          summary: "Résumé partie 2",
          annotations: [],
        },
      });

    mockConsolidate.mockRejectedValueOnce(new Error("Erreur réseau consolidation"));

    const article: Extracted = {
      title: "Grand article",
      lang: "fr",
      paragraphs: ["A".repeat(300), "B".repeat(300)],
    };

    const controller = new AbortController();
    const result = await analyzeArticle(article, baseConfig, controller.signal);

    // Repli gracieux : les résumés sont concaténés sans planter
    expect(result.summary).toBe("Résumé partie 1\n\nRésumé partie 2");
  });

  it("publie les morceaux réussis quand un morceau échoue (A3)", async () => {
    mockAnalyze
      .mockResolvedValueOnce({ raw: { summary: "Résumé partie 1", annotations: [] } })
      .mockRejectedValueOnce(new Error("503"));

    const article: Extracted = { title: "Grand article", lang: "fr", paragraphs: ["A".repeat(300), "B".repeat(300)] };
    const result = await analyzeArticle(article, baseConfig, new AbortController().signal);

    expect(result.summary).toBe("Résumé partie 1");
    expect(result.skipped).toEqual([{ index: 1, excerpt: `${"B".repeat(120)}…` }]);
    expect(mockConsolidate).not.toHaveBeenCalled();
  });

  it("échoue si tous les morceaux échouent", async () => {
    mockAnalyze.mockRejectedValue(new Error("quota"));
    const article: Extracted = { title: "T", lang: "fr", paragraphs: ["A".repeat(300), "B".repeat(300)] };
    await expect(analyzeArticle(article, baseConfig, new AbortController().signal)).rejects.toThrow("quota");
  });

  it("se replie sur la fusion si la consolidation ne renvoie pas de JSON valide (B2)", async () => {
    mockAnalyze
      .mockResolvedValueOnce({ raw: { summary: "S1", blind_spot: "Angle 1", annotations: [] } })
      .mockResolvedValueOnce({ raw: { summary: "S2", annotations: [] } });
    mockConsolidate.mockResolvedValueOnce("Voici le résumé : pas de JSON.");
    const article: Extracted = { title: "T", lang: "fr", paragraphs: ["A".repeat(300), "B".repeat(300)] };
    const result = await analyzeArticle(article, baseConfig, new AbortController().signal);
    expect(result.summary).toBe("S1\n\nS2");
    expect(result.blind_spot).toBe("Angle 1");
  });

  it("transmet les métadonnées de publication et la date d'analyse (C1)", async () => {
    mockAnalyze.mockResolvedValueOnce({ raw: { summary: "S", annotations: [] } });
    const article: Extracted = { title: "T", lang: "fr", paragraphs: ["Court."], publishedTime: "1898-01-13", byline: "Émile Zola", siteName: "L'Aurore" };
    await analyzeArticle(article, baseConfig, new AbortController().signal);
    const input = mockAnalyze.mock.calls[0]![0];
    expect(input.meta).toEqual({ publishedTime: "1898-01-13", byline: "Émile Zola", siteName: "L'Aurore" });
    expect(input.analysisDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe("mode approfondi (D10)", () => {
    const deepConfig: Config = { ...baseConfig, analysisDepth: "deep" };
    const claim = (quote: string) => ({
      id: "ann-1",
      exact_quote: quote,
      category: "sophism",
      label: "homme_de_paille",
      severity: "high",
      rhetoric_critique: "c",
      fact_check: { status: "unverified", context: "", sources: [] },
    });

    it("cartographie l'article découpé, joint le plan à chaque morceau, consolide puis relit (B1, B2, Q2)", async () => {
      const article: Extracted = { title: "Long", lang: "fr", paragraphs: [`${"A".repeat(250)} citation un.`, `${"B".repeat(250)} citation deux.`] };
      mockAnalyze
        .mockResolvedValueOnce({ raw: { summary: "S1", annotations: [claim("citation un.")] } })
        .mockResolvedValueOnce({ raw: { summary: "S2", annotations: [claim("citation deux.")] } });
      mockConsolidate.mockImplementation(async (request: { system: string }) => {
        if (request.system.includes("outline")) return "Thesis: X.";
        if (request.system.includes("review")) return '{"rejected": [{"id": "ann-2", "reason": "concession"}, {"id": "inconnu"}]}';
        return '{"summary": "Global.", "clickbait_gap": "", "blind_spot": ""}';
      });
      const phases: (string | undefined)[] = [];
      const result = await analyzeArticle(article, deepConfig, new AbortController().signal, { onProgress: (p) => phases.push(p.phase) });

      expect(mockConsolidate).toHaveBeenCalledTimes(3);
      expect(mockAnalyze.mock.calls.map((c) => c[0].outline)).toEqual(["Thesis: X.", "Thesis: X."]);
      const reviewRequest = mockConsolidate.mock.calls[2]![0];
      expect(reviewRequest.user).toContain("[ann-1] sophism/homme_de_paille");
      expect(reviewRequest.user).toContain(`Paragraph: ${"A".repeat(250)} citation un.`);
      expect(result.annotations.map((a) => [a.id, a.exact_quote])).toEqual([["ann-1", "citation un."]]);
      expect(result.summary).toBe("Global.");
      expect([...new Set(phases)]).toEqual(["mapping", "analyzing", "consolidating", "reviewing"]);
    });

    it("ne cartographie pas un article d'un seul morceau et garde tout si la relecture échoue", async () => {
      mockAnalyze.mockResolvedValueOnce({ raw: { summary: "S", annotations: [claim("Court.")] } });
      mockConsolidate.mockRejectedValueOnce(new Error("503"));
      const result = await analyzeArticle({ title: "T", lang: "fr", paragraphs: ["Court."] }, deepConfig, new AbortController().signal);
      expect(mockConsolidate).toHaveBeenCalledTimes(1);
      expect(mockConsolidate.mock.calls[0]![0].system).toContain("review");
      expect(result.annotations).toHaveLength(1);
    });

    it("n'ajoute aucun appel en mode rapide", async () => {
      mockAnalyze.mockResolvedValueOnce({ raw: { summary: "S", annotations: [claim("Court.")] } });
      await analyzeArticle({ title: "T", lang: "fr", paragraphs: ["Court."] }, baseConfig, new AbortController().signal);
      expect(mockConsolidate).not.toHaveBeenCalled();
    });
  });

  it("quoteContext renvoie le paragraphe de la citation, réduit autour d'elle s'il est long", () => {
    const long = `${"x ".repeat(600)}La citation « exacte » est là.${" y".repeat(600)}`;
    expect(quoteContext("citation un", ["Autre.", "Une citation un ici."])).toBe("Une citation un ici.");
    const ctx = quoteContext("La citation “ exacte ”", [long])!;
    expect(ctx).toContain("La citation « exacte » est là.");
    expect(ctx.length).toBeLessThan(810);
    expect(ctx.startsWith("…") && ctx.endsWith("…")).toBe(true);
    expect(quoteContext("absente", ["Rien."])).toBeUndefined();
  });

  it("transmet les callbacks de streaming au provider", async () => {
    mockAnalyze.mockImplementation(async (input) => {
      // Simule un appel streaming émis par le provider
      input.onStream?.onSummary?.("Résumé en cours...", false);
      input.onStream?.onAnnotation?.({
        id: "stream-1",
        exact_quote: "citation stream",
        category: "sophism",
        label: "homme_de_paille",
        severity: "medium",
        rhetoric_critique: "critique",
        fact_check: { status: "unverified", context: "", sources: [] },
      });
      return {
        raw: {
          summary: "Résumé final",
          annotations: [
            {
              id: "stream-1",
              exact_quote: "citation stream",
              category: "sophism",
              label: "homme_de_paille",
              severity: "medium",
              rhetoric_critique: "critique",
              fact_check: { status: "unverified", context: "", sources: [] },
            },
          ],
        },
      };
    });

    const article: Extracted = {
      title: "Article simple",
      lang: "fr",
      paragraphs: ["Un paragraphe unique."],
    };

    const summaries: string[] = [];
    const annotations: string[] = [];

    const controller = new AbortController();
    const result = await analyzeArticle(article, baseConfig, controller.signal, {
      onSummary: (s) => summaries.push(s),
      onAnnotation: (a) => annotations.push(a.id),
    });

    expect(summaries).toContain("Résumé en cours...");
    expect(summaries).toContain("Résumé final");
    expect(annotations).toEqual(["stream-1"]);
    expect(result.annotations).toHaveLength(1);
  });

  it("préfixe les identifiants d'annotations par morceau en cas de découpage", async () => {
    mockAnalyze
      .mockImplementationOnce(async (input) => {
        input.onStream?.onAnnotation?.({
          id: "ann-1",
          exact_quote: "citation part 1",
          category: "sophism",
          label: "ad_hominem",
          severity: "low",
          rhetoric_critique: "critique 1",
          fact_check: { status: "unverified", context: "", sources: [] },
        });
        return {
          raw: {
            summary: "s1",
            annotations: [
              {
                id: "ann-1",
                exact_quote: "citation part 1",
                category: "sophism",
                label: "ad_hominem",
                severity: "low",
                rhetoric_critique: "critique 1",
                fact_check: { status: "unverified", context: "", sources: [] },
              },
            ],
          },
        };
      })
      .mockImplementationOnce(async (input) => {
        input.onStream?.onAnnotation?.({
          id: "ann-1",
          exact_quote: "citation part 2",
          category: "bias",
          label: "cadrage",
          severity: "high",
          rhetoric_critique: "critique 2",
          fact_check: { status: "unverified", context: "", sources: [] },
        });
        return {
          raw: {
            summary: "s2",
            annotations: [
              {
                id: "ann-1",
                exact_quote: "citation part 2",
                category: "bias",
                label: "cadrage",
                severity: "high",
                rhetoric_critique: "critique 2",
                fact_check: { status: "unverified", context: "", sources: [] },
              },
            ],
          },
        };
      });

    const article: Extracted = {
      title: "Article long",
      lang: "fr",
      paragraphs: ["A".repeat(300), "B".repeat(300)],
    };

    const streamedIds: string[] = [];
    const controller = new AbortController();
    await analyzeArticle(article, baseConfig, controller.signal, {
      onAnnotation: (a) => streamedIds.push(a.id),
    });

    // Pendant le flux, les identifiants ont été préfixés par le morceau (p1-ann-1, p2-ann-1)
    expect(streamedIds).toEqual(["p1-ann-1", "p2-ann-1"]);
  });

  it("garantit qu'aucune URL n'apparaît dans les annotations sans recherche web (D3)", async () => {
    mockAnalyze.mockImplementation(async (input) => {
      // Modèle qui tenterait de renvoyer une URL hallucinée alors que webSearch est désactivé
      input.onStream?.onAnnotation?.({
        id: "a1",
        exact_quote: "fausse citation",
        category: "factual_claim",
        label: "statistique",
        severity: "high",
        rhetoric_critique: "allégation",
        fact_check: {
          status: "supported",
          context: "contexte inventé",
          sources: [{ title: "Fausse source", url: "https://fake.news/claim" }],
        },
      });
      return {
        raw: {
          summary: "Résumé",
          annotations: [
            {
              id: "a1",
              exact_quote: "fausse citation",
              category: "factual_claim",
              label: "statistique",
              severity: "high",
              rhetoric_critique: "allégation",
              fact_check: {
                status: "supported",
                context: "contexte inventé",
                sources: [{ title: "Fausse source", url: "https://fake.news/claim" }],
              },
            },
          ],
        },
      };
    });

    const article: Extracted = {
      title: "Test D3",
      lang: "fr",
      paragraphs: ["Un court texte."],
    };

    let streamedAnnotation: Annotation | undefined;
    const controller = new AbortController();
    const result = await analyzeArticle(article, { ...baseConfig, webSearch: false }, controller.signal, {
      onAnnotation: (a) => {
        streamedAnnotation = a;
      },
    });

    // En flux : status unverified et 0 sources (D3)
    expect(streamedAnnotation?.fact_check.status).toBe("unverified");
    expect(streamedAnnotation?.fact_check.sources).toEqual([]);

    // En résultat final : pareillement nettoyé
    expect(result.annotations[0]!.fact_check.status).toBe("unverified");
    expect(result.annotations[0]!.fact_check.sources).toEqual([]);
  });

  it("transmet les consommations de tokens en continu via onUsage", async () => {
    mockAnalyze.mockImplementationOnce(async (input) => {
      input.onStream?.onUsage?.({ inputTokens: 400, outputTokens: 50, totalTokens: 450 });
      return {
        raw: {
          summary: "Résumé unique",
          annotations: [],
        },
        usage: { inputTokens: 400, outputTokens: 120, totalTokens: 520 },
      };
    });

    const article: Extracted = {
      title: "Test tokens",
      lang: "fr",
      paragraphs: ["Court texte."],
    };

    const usages: unknown[] = [];
    await analyzeArticle(article, baseConfig, new AbortController().signal, {
      onUsage: (u) => usages.push(u),
    });

    expect(usages.length).toBeGreaterThanOrEqual(2);
    expect(usages[0]).toEqual({ inputTokens: 400, outputTokens: 50, totalTokens: 450 });
    expect(usages[usages.length - 1]).toEqual({ inputTokens: 400, outputTokens: 120, totalTokens: 520 });
  });
});
