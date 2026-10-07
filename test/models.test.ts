import { describe, expect, it, vi } from "vitest";
import { FALLBACK_MODELS, fetchAvailableModels } from "../src/providers/models";

describe("models module", () => {
  it("fournit des listes de modèles de repli pour chaque provider", () => {
    expect(FALLBACK_MODELS.gemini.some((m) => m.id === "gemini-3.8-flash")).toBe(true);
    expect(FALLBACK_MODELS.anthropic.some((m) => m.id.includes("claude"))).toBe(true);
    expect(FALLBACK_MODELS["openai-compatible"].some((m) => m.id === "mistral")).toBe(true);
    expect(FALLBACK_MODELS["chrome-ai"].some((m) => m.id === "gemini-nano")).toBe(true);
  });

  it("récupère et filtre dynamiquement les modèles Gemini", async () => {
    const mockApiResponse = {
      models: [
        {
          name: "models/gemini-3.8-flash",
          displayName: "Gemini 3.8 Flash",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          displayName: "Embedding",
          supportedGenerationMethods: ["embedContent"],
        },
        {
          name: "models/gemini-3.8-pro",
          displayName: "Gemini 3.8 Pro",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockApiResponse), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const models = await fetchAvailableModels("gemini", "test-key", "");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?key=test-key",
      expect.anything(),
    );
    expect(models).toHaveLength(2);
    expect(models[0]!.id).toBe("gemini-3.8-flash");
    expect(models[1]!.id).toBe("gemini-3.8-pro");
  });

  it("récupère les modèles OpenAI/Ollama", async () => {
    const mockApiResponse = {
      data: [{ id: "mistral:latest" }, { id: "llama3.2:3b" }],
    };

    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockApiResponse), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const models = await fetchAvailableModels("openai-compatible", "", "http://localhost:11434/v1");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.anything());
    expect(models).toEqual([
      { id: "mistral:latest", name: "mistral:latest" },
      { id: "llama3.2:3b", name: "llama3.2:3b" },
    ]);
  });

  it("se replie sur les modèles par défaut en cas d'erreur réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const models = await fetchAvailableModels("gemini", "test-key", "");
    expect(models).toEqual(FALLBACK_MODELS.gemini);
  });

  it("n'envoie jamais la clé Anthropic vers l'endpoint du provider compatible OpenAI", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "claude-opus-5-5" }] }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await fetchAvailableModels("anthropic", "sk-ant-api03-test", "https://openrouter.ai/api/v1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]![0]).toBe("https://api.anthropic.com/v1/models");
  });
});
