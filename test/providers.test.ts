import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";
import { geminiProvider } from "../src/providers/gemini";
import { openAiCompatibleProvider } from "../src/providers/openai-compatible";
import { chromeAiProvider } from "../src/providers/chrome-ai";

describe("geminiProvider", () => {
  const baseConfig: Config = {
    provider: "gemini",
    apiKey: "test-gemini-key",
    model: "gemini-2.5-flash",
    endpoint: "",
    language: "fr",
    webSearch: true,
    maxChunkTokens: 8_000,
    displayMode: "both",
  };

  it("gère supportsWebSearch selon la configuration", () => {
    expect(geminiProvider.supportsWebSearch({ ...baseConfig, webSearch: true })).toBe(true);
    expect(geminiProvider.supportsWebSearch({ ...baseConfig, webSearch: false })).toBe(false);
  });

  it("inclut googleSearch dans les tools et capture le groundingMetadata", async () => {
    const sseResponse = [
      'data: {"candidates":[{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://lemonde.fr/article-123","title":"Le Monde"}}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"summary\\":\\"Test\\",\\"annotations\\":[]}"}]}}]}\n\n',
    ].join("");

    const mockFetch = vi.fn().mockImplementation(async () => new Response(sseResponse, { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await geminiProvider.analyze(
      { title: "Test", text: "Article de test", language: "fr", part: { index: 0, total: 1 }, webSearch: true },
      baseConfig,
      new AbortController().signal,
    );

    expect(result.raw).toEqual({ summary: "Test", annotations: [] });
    expect(result.searchedUrls).toBeDefined();
    expect(result.searchedUrls?.has("https://lemonde.fr/article-123")).toBe(true);

    const callBody = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(callBody.tools).toEqual([{ googleSearch: {} }]);
  });
});

describe("openAiCompatibleProvider", () => {
  const baseConfig: Config = {
    provider: "openai-compatible",
    apiKey: "test-key",
    model: "sonar",
    endpoint: "https://api.perplexity.ai",
    language: "fr",
    webSearch: true,
    maxChunkTokens: 8_000,
    displayMode: "both",
  };

  it("gère supportsWebSearch selon la configuration", () => {
    expect(openAiCompatibleProvider.supportsWebSearch({ ...baseConfig, webSearch: true })).toBe(true);
    expect(openAiCompatibleProvider.supportsWebSearch({ ...baseConfig, webSearch: false })).toBe(false);
  });

  it("capture les citations retournées par l'endpoint (format Perplexity/OpenRouter)", async () => {
    const sseResponse = [
      'data: {"choices":[{"delta":{"content":"{\\"summary\\":\\"Analyse\\",\\"annotations\\":[]}"}}],"citations":["https://en.wikipedia.org/wiki/Test"]}\n\n',
    ].join("");

    const mockFetch = vi.fn().mockImplementation(async () => new Response(sseResponse, { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await openAiCompatibleProvider.analyze(
      { title: "Test", text: "Article de test", language: "fr", part: { index: 0, total: 1 }, webSearch: true },
      baseConfig,
      new AbortController().signal,
    );

    expect(result.raw).toEqual({ summary: "Analyse", annotations: [] });
    expect(result.searchedUrls).toBeDefined();
    expect(result.searchedUrls?.has("https://en.wikipedia.org/wiki/Test")).toBe(true);
  });
});

describe("chromeAiProvider", () => {
  const baseConfig: Config = {
    provider: "chrome-ai",
    apiKey: "",
    model: "gemini-nano",
    endpoint: "",
    language: "fr",
    webSearch: false,
    maxChunkTokens: 8_000,
    displayMode: "both",
  };

  it("indique supportsWebSearch = false", () => {
    expect(chromeAiProvider.supportsWebSearch(baseConfig)).toBe(false);
  });

  it("échoue si Chrome AI n'est pas disponible", async () => {
    vi.stubGlobal("ai", undefined);

    await expect(
      chromeAiProvider.analyze(
        { title: "Test", text: "Article", language: "fr", part: { index: 0, total: 1 }, webSearch: false },
        baseConfig,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Chrome Built-in AI (Gemini Nano) n'est pas disponible");
  });

  it("analyse et extrait le JSON avec streaming quand Chrome AI est disponible", async () => {
    const mockDestroy = vi.fn();
    const mockSession = {
      promptStreaming: vi.fn().mockImplementation(async function* () {
        yield '{"summary":';
        yield '{"summary":"Analyse locale",';
        yield '{"summary":"Analyse locale","annotations":[]}';
      }),
      destroy: mockDestroy,
    };

    const mockAi = {
      languageModel: {
        capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
        create: vi.fn().mockResolvedValue(mockSession),
      },
    };
    vi.stubGlobal("ai", mockAi);

    const summaries: string[] = [];
    const result = await chromeAiProvider.analyze(
      {
        title: "Test",
        text: "Article",
        language: "fr",
        part: { index: 0, total: 1 },
        webSearch: false,
        onStream: {
          onSummary: (s) => summaries.push(s),
        },
      },
      baseConfig,
      new AbortController().signal,
    );

    expect(result.raw).toEqual({ summary: "Analyse locale", annotations: [] });
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(summaries).toContain("Analyse locale");
  });
});
