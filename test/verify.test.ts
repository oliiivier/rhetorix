import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type Config } from "../src/config";
import type { Annotation } from "../src/schema";

const mockComplete = vi.fn();

vi.mock("../src/providers/gemini", () => ({
  geminiProvider: {
    supportsWebSearch: () => false,
    searchesOnDemand: () => true,
    analyze: vi.fn(),
    complete: (...args: unknown[]) => mockComplete(...args),
  },
}));

const { canVerifyOnDemand, verifyAnnotation } = await import("../src/verify");

const config: Config = { ...DEFAULT_CONFIG, provider: "gemini", apiKey: "k", model: "m", language: "fr", webSearch: false };

const claim: Annotation = {
  id: "ann-3",
  exact_quote: "Le chômage a baissé de 2 %.",
  category: "factual_claim",
  label: "chiffre",
  severity: "high",
  rhetoric_critique: "Chiffre central de l'argument.",
  fact_check: { status: "unverified", context: "", sources: [] },
};

describe("verifyAnnotation (C2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("active la recherche web pour ce seul appel et ne garde que les sources trouvées (D3)", async () => {
    mockComplete.mockImplementation(async (_req, _config, _signal, callbacks) => {
      callbacks.onSource("https://insee.test/chomage#t1");
      return '{"status": "misleading", "context": "Baisse de 0,2 point.", "sources": [{"title": "Insee", "url": "https://insee.test/chomage"}, {"title": "Inventé", "url": "https://faux.test/"}]}';
    });
    const fc = await verifyAnnotation(claim, { title: "Titre", paragraph: "Contexte." }, config, new AbortController().signal);

    const [request] = mockComplete.mock.calls[0]!;
    expect(request).toMatchObject({ webSearch: true, json: true });
    expect(request.user).toContain("Claim: Le chômage a baissé de 2 %.");
    expect(request.user).toContain("Paragraph: Contexte.");
    expect(request.system).toContain("in this language: fr");
    expect(fc).toEqual({ status: "misleading", context: "Baisse de 0,2 point.", sources: [{ title: "Insee", url: "https://insee.test/chomage" }] });
  });

  it("repasse en non vérifié sans source issue de la recherche", async () => {
    mockComplete.mockResolvedValue('{"status": "refuted", "context": "c", "sources": [{"title": "x", "url": "https://x.test/"}]}');
    const fc = await verifyAnnotation(claim, { title: "T" }, config, new AbortController().signal);
    expect(fc.status).toBe("unverified");
    expect(fc.sources).toEqual([]);
  });

  it("lève une erreur typée si la réponse n'est pas du JSON", async () => {
    mockComplete.mockResolvedValue("Je n'ai rien trouvé.");
    await expect(verifyAnnotation(claim, { title: "T" }, config, new AbortController().signal)).rejects.toMatchObject({ code: "invalid_json" });
  });

  it("dépend de la capacité du provider, pas du réglage de recherche web", () => {
    expect(canVerifyOnDemand(config)).toBe(true);
    expect(canVerifyOnDemand({ ...config, provider: "chrome-ai" })).toBe(false);
  });
});
