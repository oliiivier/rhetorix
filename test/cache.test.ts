import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCached, getCachedByUrl, matchesFingerprint, normalizeUrl, putCached, type CacheEntry, type CacheFingerprint } from "../src/cache";
import { ENGINE_VERSION } from "../src/engine-settings";

const storage = new Map<string, unknown>();
vi.mock("../src/ext", () => ({
  ext: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          if (typeof keys === "string") return { [keys]: storage.get(keys) };
          const res: Record<string, unknown> = {};
          for (const k of keys) res[k] = storage.get(k);
          return res;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) storage.set(k, v);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) storage.delete(k);
        }),
      },
    },
  },
}));

describe("cache module", () => {
  beforeEach(() => {
    storage.clear();
  });

  describe("normalizeUrl", () => {
    it("retire fragment et paramètres de suivi, trie les autres", () => {
      expect(normalizeUrl("https://ex.org/a?utm_source=x&b=2&a=1&fbclid=z#top")).toBe("https://ex.org/a?a=1&b=2");
    });
  });

  describe("getCachedByUrl", () => {
    it("renvoie null si l'URL n'est pas en cache", async () => {
      expect(await getCachedByUrl("https://ex.org/uncached")).toBeNull();
    });

    it("renvoie l'entrée en cache si elle existe", async () => {
      const entry: CacheEntry = {
        analysis: { summary: "Test", annotations: [] },
        textHash: "th1",
        provider: "ollama",
        model: "mistral",
        lang: "fr",
        createdAt: 1000,
      };
      await putCached("https://ex.org/article?utm_source=rss", entry);
      const retrieved = await getCachedByUrl("https://ex.org/article");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.analysis.summary).toBe("Test");
    });
  });

  describe("empreinte (A1)", () => {
    const fp: CacheFingerprint = {
      textHash: "th",
      provider: "anthropic",
      model: "m",
      lang: "fr",
      engineVersion: ENGINE_VERSION,
      webSearch: true,
      maxChunkTokens: 8000,
    };
    const entry: CacheEntry = { ...fp, analysis: { summary: "S", annotations: [] }, createdAt: 1 };

    it("accepte une entrée produite avec les mêmes texte et réglages", () => {
      expect(matchesFingerprint(entry, fp)).toBe(true);
    });

    it("refuse une entrée dont la version du moteur, la recherche web ou le découpage diffère", () => {
      expect(matchesFingerprint(entry, { ...fp, engineVersion: ENGINE_VERSION + 1 })).toBe(false);
      expect(matchesFingerprint(entry, { ...fp, webSearch: false })).toBe(false);
      expect(matchesFingerprint(entry, { ...fp, maxChunkTokens: 4000 })).toBe(false);
      expect(matchesFingerprint(entry, { ...fp, textHash: "autre" })).toBe(false);
    });

    it("refuse une entrée antérieure au versionnage", async () => {
      const legacy: CacheEntry = { analysis: entry.analysis, textHash: "th", provider: "anthropic", model: "m", lang: "fr", createdAt: 1 };
      expect(matchesFingerprint(legacy, fp)).toBe(false);
      await putCached("https://ex.org/legacy", legacy);
      expect(await getCached("https://ex.org/legacy", fp)).toBeNull();
      expect(await getCachedByUrl("https://ex.org/legacy")).not.toBeNull();
    });
  });
});
