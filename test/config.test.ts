import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, isConfigured, loadConfig, providerOrigin, resolveLanguage, saveConfig, type Config } from "../src/config";

const store: Record<string, unknown> = {};

vi.mock("../src/ext", () => ({
  ext: {
    storage: {
      local: {
        get: vi.fn(async (key: string | string[]) => {
          const k = typeof key === "string" ? key : key[0]!;
          return { [k]: store[k] };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
      },
    },
    i18n: {
      getUILanguage: () => "fr-FR",
    },
  },
}));

describe("config module", () => {
  it("fournit une configuration par défaut valide avec displayMode 'both'", () => {
    expect(DEFAULT_CONFIG.displayMode).toBe("both");
    expect(DEFAULT_CONFIG.provider).toBe("anthropic");
    expect(DEFAULT_CONFIG.language).toBe("auto");
    expect(DEFAULT_CONFIG.webSearch).toBe(true);
    expect(DEFAULT_CONFIG.maxChunkTokens).toBe(8_000);
  });

  it("vérifie isConfigured selon le provider et les clés requises", () => {
    const unconfigured: Config = { ...DEFAULT_CONFIG, apiKey: "" };
    expect(isConfigured(unconfigured)).toBe(false);

    const configuredAnthropic: Config = { ...DEFAULT_CONFIG, apiKey: "sk-ant-test" };
    expect(isConfigured(configuredAnthropic)).toBe(true);

    const openAiNoEndpoint: Config = { ...DEFAULT_CONFIG, provider: "openai-compatible", apiKey: "sk-test", endpoint: "" };
    expect(isConfigured(openAiNoEndpoint)).toBe(false);

    const openAiConfigured: Config = {
      ...DEFAULT_CONFIG,
      provider: "openai-compatible",
      apiKey: "sk-test",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    };
    expect(isConfigured(openAiConfigured)).toBe(true);

    const chromeAiConfigured: Config = {
      ...DEFAULT_CONFIG,
      provider: "chrome-ai",
      apiKey: "",
      model: "gemini-nano",
    };
    expect(isConfigured(chromeAiConfigured)).toBe(true);
  });

  it("retourne l'origine attendue pour providerOrigin", () => {
    expect(providerOrigin({ ...DEFAULT_CONFIG, provider: "anthropic" })).toBe("https://api.anthropic.com/*");
    expect(providerOrigin({ ...DEFAULT_CONFIG, provider: "gemini" })).toBe("https://generativelanguage.googleapis.com/*");
    expect(providerOrigin({ ...DEFAULT_CONFIG, provider: "chrome-ai" })).toBeNull();
    expect(providerOrigin({ ...DEFAULT_CONFIG, provider: "openai-compatible", endpoint: "https://api.groq.com/openai/v1" })).toBe(
      "https://api.groq.com/*",
    );
    expect(providerOrigin({ ...DEFAULT_CONFIG, provider: "openai-compatible", endpoint: "not-a-url" })).toBeNull();
  });

  it("résout la langue avec fallback getUILanguage quand language === 'auto'", () => {
    expect(resolveLanguage({ ...DEFAULT_CONFIG, language: "auto" })).toBe("fr-FR");
    expect(resolveLanguage({ ...DEFAULT_CONFIG, language: "en" })).toBe("en");
  });

  it("charge et enregistre la configuration en incluant displayMode", async () => {
    const initial = await loadConfig();
    expect(initial.displayMode).toBe("both");

    await saveConfig({ ...initial, displayMode: "inline" });
    const updated = await loadConfig();
    expect(updated.displayMode).toBe("inline");

    await saveConfig({ ...initial, displayMode: "sidepanel" });
    const sidepanelMode = await loadConfig();
    expect(sidepanelMode.displayMode).toBe("sidepanel");
  });
});

