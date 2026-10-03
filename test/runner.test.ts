import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";
import type { PanelToContent, RunSnapshot } from "../src/messages";
import type { Annotation } from "../src/schema";

const tabMessages: PanelToContent[] = [];
let extractResponse: unknown;
let config: Config;

vi.mock("../src/ext", () => ({
  ext: {
    runtime: { getPlatformInfo: vi.fn(async () => ({})) },
    scripting: { executeScript: vi.fn(async () => []), insertCSS: vi.fn(async () => undefined) },
    tabs: {
      sendMessage: vi.fn(async (_tabId: number, msg: PanelToContent) => {
        tabMessages.push(msg);
        if (msg.type === "extract") return extractResponse;
        if (msg.type === "highlight") return { unlocated: ["ann-2"] };
        return null;
      }),
    },
    i18n: { getUILanguage: () => "fr" },
  },
}));

vi.mock("../src/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config")>()),
  loadConfig: vi.fn(async () => config),
}));

const mockAnalyze = vi.fn();
vi.mock("../src/analyze", () => ({ analyzeArticle: (...args: unknown[]) => mockAnalyze(...args) }));

const mockGetCached = vi.fn();
const mockPutCached = vi.fn();
vi.mock("../src/cache", () => ({
  sha256: async () => "hash",
  getCached: (...args: unknown[]) => mockGetCached(...args),
  putCached: (...args: unknown[]) => mockPutCached(...args),
}));

const { runAnalysis, cancelRun, forgetTab, getSnapshot } = await import("../src/runner");

function annotation(id: string): Annotation {
  return {
    id,
    exact_quote: `citation ${id}`,
    category: "sophism",
    label: "autre",
    severity: "low",
    rhetoric_critique: "critique",
    fact_check: { status: "unverified", context: "", sources: [] },
  };
}

describe("runAnalysis (script de fond, D9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabMessages.length = 0;
    extractResponse = { ok: true, article: { title: "T", lang: "fr", paragraphs: ["Un paragraphe."] } };
    config = {
      provider: "openai-compatible",
      apiKey: "",
      model: "m",
      endpoint: "https://api.test/v1",
      language: "fr",
      webSearch: false,
      maxChunkTokens: 8000,
      displayMode: "both",
    };
    mockGetCached.mockResolvedValue(null);
  });

  it("publie le flux puis l'état final et surligne la page", async () => {
    mockAnalyze.mockImplementation(async (_article, _config, _signal, cb) => {
      cb.onSummary("Résumé", true);
      cb.onAnnotation(annotation("ann-1"));
      return { summary: "Résumé", annotations: [annotation("ann-1"), annotation("ann-2")] };
    });
    const updates: RunSnapshot[] = [];
    const final = await runAnalysis(1, "https://ex.test/a", { force: false }, (s) => updates.push(s));

    expect(updates.some((s) => s.status === "running" && s.annotations.length === 1)).toBe(true);
    expect(final.status).toBe("done");
    expect(final.annotations).toHaveLength(2);
    expect(final.unlocated).toEqual(["ann-2"]);
    expect(updates.at(-1)).toEqual(final);
    expect(mockPutCached).toHaveBeenCalledOnce();
    const highlight = tabMessages.find((m) => m.type === "highlight");
    expect(highlight).toMatchObject({ displayMode: "both", lang: "fr" });
    expect(getSnapshot(1)?.status).toBe("done");
  });

  it("impose le mode d'affichage demandé (mobile : bulles seules)", async () => {
    mockAnalyze.mockResolvedValue({ summary: "", annotations: [] });
    await runAnalysis(2, undefined, { force: false, displayMode: "inline" }, () => {});
    expect(tabMessages.find((m) => m.type === "highlight")).toMatchObject({ displayMode: "inline" });
  });

  it("réutilise le cache sans appeler le LLM", async () => {
    mockGetCached.mockResolvedValue({ analysis: { summary: "S", annotations: [annotation("ann-1")] }, createdAt: 42 });
    const final = await runAnalysis(3, "https://ex.test/b", { force: false }, () => {});
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(final).toMatchObject({ status: "done", cachedAt: 42, summary: "S" });
  });

  it("ignore le cache quand l'analyse est forcée", async () => {
    mockGetCached.mockResolvedValue({ analysis: { summary: "S", annotations: [] }, createdAt: 42 });
    mockAnalyze.mockResolvedValue({ summary: "Nouveau", annotations: [] });
    const final = await runAnalysis(4, "https://ex.test/c", { force: true }, () => {});
    expect(mockAnalyze).toHaveBeenCalledOnce();
    expect(final.summary).toBe("Nouveau");
  });

  it("passe à cancelled après une annulation", async () => {
    mockAnalyze.mockImplementation(
      (_a, _c, signal: AbortSignal) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const pending = runAnalysis(5, undefined, { force: false }, () => {});
    await vi.waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    cancelRun(5);
    expect((await pending).status).toBe("cancelled");
  });

  it("ne publie plus rien pour un onglet oublié (rechargé ou fermé)", async () => {
    let release!: () => void;
    mockAnalyze.mockImplementation(() => new Promise((resolve) => (release = () => resolve({ summary: "", annotations: [] }))));
    const updates: RunSnapshot[] = [];
    const pending = runAnalysis(6, undefined, { force: false }, (s) => updates.push(s));
    await vi.waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    const before = updates.length;
    forgetTab(6);
    release();
    await pending;
    expect(updates).toHaveLength(before);
    expect(getSnapshot(6)).toBeNull();
  });

  it("traduit les erreurs d'extraction", async () => {
    extractResponse = { ok: false, error: "x", errorCode: "no_article" };
    const final = await runAnalysis(7, undefined, { force: false }, () => {});
    expect(final.status).toBe("error");
    expect(final.error).toBeTruthy();
    expect(final.error).not.toBe("x");
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("refuse une configuration incomplète", async () => {
    config = { ...config, endpoint: "" };
    const final = await runAnalysis(8, undefined, { force: false }, () => {});
    expect(final.status).toBe("error");
    expect(tabMessages).toHaveLength(0);
  });
});
