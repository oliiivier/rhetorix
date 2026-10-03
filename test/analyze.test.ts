import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extracted } from "../src/messages";
import type { Config } from "../src/config";

const mockAnalyze = vi.fn();
const mockConsolidate = vi.fn();
const mockSupportsWebSearch = vi.fn();

vi.mock("../src/providers/openai-compatible", () => ({
  openAiCompatibleProvider: {
    supportsWebSearch: (config: Config) => mockSupportsWebSearch(config),
    analyze: (...args: unknown[]) => mockAnalyze(...args),
    consolidateSummary: (...args: unknown[]) => mockConsolidate(...args),
  },
}));

// Doit être importé après vi.mock
const { analyzeArticle } = await import("../src/analyze");

describe("analyzeArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupportsWebSearch.mockReturnValue(false);
  });

  const baseConfig: Config = {
    provider: "openai-compatible",
    apiKey: "test-key",
    model: "test-model",
    endpoint: "https://api.test/v1",
    language: "fr",
    webSearch: false,
    maxChunkTokens: 50, // petit seuil pour forcer le découpage si nécessaire
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

    const result = await analyzeArticle(article, baseConfig, controller.signal, (p) => {
      progressCalls.push(p);
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

    mockConsolidate.mockResolvedValueOnce("Résumé consolidé global.");

    const article: Extracted = {
      title: "Grand article",
      lang: "fr",
      // Deux longs paragraphes qui dépassent maxChunkTokens (50 tokens = ~200 chars)
      paragraphs: ["A".repeat(300), "B".repeat(300)],
    };

    const progressCalls: Array<{ phase?: string; done: number; total: number }> = [];
    const controller = new AbortController();

    const result = await analyzeArticle(article, baseConfig, controller.signal, (p) => {
      progressCalls.push(p);
    });

    expect(mockAnalyze).toHaveBeenCalledTimes(2);
    expect(mockConsolidate).toHaveBeenCalledTimes(1);
    expect(mockConsolidate).toHaveBeenCalledWith(
      "Grand article",
      ["Résumé partie 1", "Résumé partie 2"],
      "fr",
      baseConfig,
      controller.signal,
    );
    expect(result.summary).toBe("Résumé consolidé global.");
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
    const result = await analyzeArticle(article, baseConfig, controller.signal, () => {});

    // Repli gracieux : les résumés sont concaténés sans planter
    expect(result.summary).toBe("Résumé partie 1\n\nRésumé partie 2");
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
});
