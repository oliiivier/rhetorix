import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type Config } from "../src/config";
import { anthropicProvider, createAnthropicClient } from "../src/providers/anthropic";
import { chromeAiProvider } from "../src/providers/chrome-ai";
import { geminiProvider } from "../src/providers/gemini";
import { mistralProvider } from "../src/providers/mistral";
import { openAiCompatibleProvider } from "../src/providers/openai-compatible";

describe("geminiProvider", () => {
  const baseConfig: Config = {
    ...DEFAULT_CONFIG,
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
    ...DEFAULT_CONFIG,
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

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.perplexity.ai/chat/completions");
    expect(JSON.parse(init.body).stream_options).toEqual({ include_usage: true });
  });
});

describe("mistralProvider", () => {
  const baseConfig: Config = {
    ...DEFAULT_CONFIG,
    provider: "mistral",
    apiKey: "test-mistral-key",
    model: "mistral-small-latest",
    webSearch: true,
  };
  const sseResponse =
    'data: {"choices":[{"delta":{"content":"{\\"summary\\":\\"Analyse\\",\\"annotations\\":[]}"}}],"usage":{"prompt_tokens":12,"completion_tokens":5}}\n\n';

  it("n'a pas de recherche web, quel que soit le réglage", () => {
    expect(mistralProvider.supportsWebSearch(baseConfig)).toBe(false);
    expect(mistralProvider.searchesOnDemand(baseConfig)).toBe(false);
  });

  it("appelle api.mistral.ai même si un endpoint compatible OpenAI est resté enregistré", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => new Response(sseResponse, { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await mistralProvider.analyze(
      { title: "Test", text: "Article de test", language: "fr", part: { index: 0, total: 1 }, webSearch: true },
      { ...baseConfig, endpoint: "https://openrouter.ai/api/v1" },
      new AbortController().signal,
    );

    expect(result.raw).toEqual({ summary: "Analyse", annotations: [] });
    expect(result.searchedUrls).toBeUndefined();
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5, totalTokens: 17 });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test-mistral-key");
    const body = JSON.parse(init.body);
    expect(body.response_format.type).toBe("json_schema");
    // Paramètre absent de l'API Mistral.
    expect(body.stream_options).toBeUndefined();
  });

  it("garde l'adresse fixe pour les appels textuels", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n';
    const mockFetch = vi.fn().mockImplementation(async () => new Response(sse, { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const text = await mistralProvider.complete(
      { system: "s", user: "u" },
      { ...baseConfig, endpoint: "https://openrouter.ai/api/v1" },
      new AbortController().signal,
    );

    expect(text).toBe("ok");
    expect(mockFetch.mock.calls[0]![0]).toBe("https://api.mistral.ai/v1/chat/completions");
  });
});

describe("chromeAiProvider", () => {
  const baseConfig: Config = {
    ...DEFAULT_CONFIG,
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

describe("anthropicProvider", () => {
  it("indique supportsWebSearch = true", () => {
    expect(anthropicProvider.supportsWebSearch({} as Config)).toBe(true);
  });

  it("appelle api.anthropic.com même si un endpoint compatible OpenAI est resté enregistré", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("réseau coupé"));
    vi.stubGlobal("fetch", mockFetch);
    const config: Config = { ...DEFAULT_CONFIG, provider: "anthropic", apiKey: "sk-ant-api03-test", endpoint: "https://openrouter.ai/api/v1" };

    await anthropicProvider
      .analyze({ title: "T", text: "Texte", language: "fr", part: { index: 0, total: 1 }, webSearch: false }, config, new AbortController().signal)
      .catch(() => {});

    expect(mockFetch).toHaveBeenCalled();
    for (const [url] of mockFetch.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\//);
    }
  });

  it("configure une clé standard avec apiKey", () => {
    const client = createAnthropicClient("sk-ant-api03-test-key");
    expect(client.baseURL).toBe("https://api.anthropic.com");
    expect(client.apiKey).toBe("sk-ant-api03-test-key");
    expect(client.authToken).toBeNull();
  });

  it("configure un token OAuth Claude Code (sk-ant-oat) avec authToken et defaultHeaders", () => {
    const client = createAnthropicClient("sk-ant-oat01-my-oauth-token");
    expect(client.authToken).toBe("sk-ant-oat01-my-oauth-token");
    expect(client.apiKey).toBeNull();
    // @ts-expect-error test private options
    expect(client._options?.defaultHeaders?.["anthropic-beta"]).toBe("oauth-2025-04-20");
  });

  it("nettoie le préfixe Bearer sur un token OAuth", () => {
    const client = createAnthropicClient("Bearer sk-ant-oat01-token-with-bearer");
    expect(client.authToken).toBe("sk-ant-oat01-token-with-bearer");
    expect(client.apiKey).toBeNull();
    // @ts-expect-error test private options
    expect(client._options?.defaultHeaders?.["anthropic-beta"]).toBe("oauth-2025-04-20");
  });
});

