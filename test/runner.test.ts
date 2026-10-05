import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, type Config } from "../src/config";
import type { PanelToContent, RunSnapshot } from "../src/messages";
import { analysisSettings } from "../src/engine-settings";
import type { Annotation } from "../src/schema";

const tabMessages: PanelToContent[] = [];
let extractResponse: unknown;
let youtubeExtractResponse: unknown;
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
        if (msg.type === "youtube-extract") return youtubeExtractResponse;
        if (msg.type === "youtube-set-options") return { ok: true };
        if (msg.type === "youtube-highlight") return { ok: true };
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
const mockGetCachedByUrl = vi.fn();
const mockPutCached = vi.fn();
vi.mock("../src/cache", () => ({
  sha256: async () => "hash",
  getCached: (...args: unknown[]) => mockGetCached(...args),
  getCachedByUrl: (...args: unknown[]) => mockGetCachedByUrl(...args),
  putCached: (...args: unknown[]) => mockPutCached(...args),
}));

const { runAnalysis, cancelRun, forgetTab, getSnapshot, loadCachedRun } = await import("../src/runner");

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
      ...DEFAULT_CONFIG,
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
      return {
        summary: "Résumé",
        clickbait_gap: "Titre trompeur",
        blind_spot: "Point de vue manquant",
        annotations: [annotation("ann-1"), annotation("ann-2")],
      };
    });
    const updates: RunSnapshot[] = [];
    const final = await runAnalysis(1, "https://ex.test/a", { force: false }, (s) => updates.push(s));

    expect(updates.some((s) => s.status === "running" && s.annotations.length === 1)).toBe(true);
    expect(final.status).toBe("done");
    expect(final.clickbaitGap).toBe("Titre trompeur");
    expect(final.blindSpot).toBe("Point de vue manquant");
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

  it("conserve et surligne les annotations reçues avant une erreur (A3)", async () => {
    mockAnalyze.mockImplementation(async (_a, _c, _s, cb) => {
      cb.onAnnotation(annotation("p1-ann-1"));
      throw new Error("réseau");
    });
    const final = await runAnalysis(20, "https://ex.test/err", { force: false }, () => {});
    expect(final.status).toBe("error");
    expect(final.annotations.map((a) => a.id)).toEqual(["p1-ann-1"]);
    expect(tabMessages.find((m) => m.type === "highlight")).toMatchObject({ annotations: [{ id: "p1-ann-1" }] });
    expect(mockPutCached).not.toHaveBeenCalled();
  });

  it("publie une analyse partielle sans la mettre en cache (A3)", async () => {
    mockAnalyze.mockResolvedValue({
      summary: "S",
      annotations: [annotation("ann-1")],
      skipped: [{ index: 1, excerpt: "Deuxième partie…" }],
    });
    const final = await runAnalysis(21, "https://ex.test/partial", { force: false }, () => {});
    expect(final.status).toBe("done");
    expect(final.skipped).toEqual(["Deuxième partie…"]);
    expect(mockPutCached).not.toHaveBeenCalled();
  });

  it("signale une nouvelle tentative pendant l'analyse (A4)", async () => {
    mockAnalyze.mockImplementation(async (_a, _c, _s, cb) => {
      cb.onRetry({ attempt: 1, delayMs: 2000, status: 429 });
      cb.onProgress({ phase: "analyzing", done: 1, total: 1 });
      return { summary: "", annotations: [] };
    });
    const updates: RunSnapshot[] = [];
    const final = await runAnalysis(22, undefined, { force: false }, (s) => updates.push(s));
    expect(updates.some((s) => s.retrying)).toBe(true);
    expect(final.retrying).toBe(false);
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

  it("gère l'analyse d'une vidéo YouTube par tranche", async () => {
    youtubeExtractResponse = {
      ok: true,
      extracted: {
        title: "Vidéo Test",
        lang: "fr",
        paragraphs: ["citation ann-yt-1 dans la transcription."],
      },
      slice: {
        index: 0,
        startSec: 0,
        endSec: 900,
        cues: [{ text: "citation ann-yt-1 dans la transcription.", startMs: 10000, durationMs: 5000 }],
      },
      transcript: {
        videoId: "dQw4w9WgXcQ",
        language: "fr",
        isGenerated: false,
        durationMs: 1200000,
        cues: [],
      },
    };

    mockAnalyze.mockImplementation(async (_article, _config, _signal, cb) => {
      cb.onSummary("Résumé YouTube", true);
      const ann = annotation("ann-yt-1");
      ann.exact_quote = "citation ann-yt-1";
      cb.onAnnotation(ann);
      return {
        summary: "Résumé YouTube",
        clickbait_gap: null,
        blind_spot: null,
        annotations: [ann],
      };
    });

    const final = await runAnalysis(9, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { force: false }, () => {});

    expect(final.status).toBe("done");
    expect(final.isVideo).toBe(true);
    expect(final.summary).toBe("Résumé YouTube");
    expect(final.annotations).toHaveLength(1);
    expect(final.videoChunkRange).toEqual({ startSec: 0, endSec: 900 });
    expect(tabMessages.some((m) => m.type === "youtube-set-options")).toBe(true);
    expect(tabMessages.some((m) => m.type === "youtube-extract")).toBe(true);
    expect(tabMessages.some((m) => m.type === "youtube-highlight")).toBe(true);
  });

  describe("loadCachedRun", () => {
    it("renvoie null si l'URL est absente ou non web", async () => {
      expect(await loadCachedRun(10, undefined)).toBeNull();
      expect(await loadCachedRun(10, "about:blank")).toBeNull();
      expect(mockGetCachedByUrl).not.toHaveBeenCalled();
    });

    it("renvoie null si la page n'est pas en cache", async () => {
      mockGetCachedByUrl.mockResolvedValueOnce(null);
      const res = await loadCachedRun(11, "https://ex.test/uncached");
      expect(res).toBeNull();
      expect(mockGetCachedByUrl).toHaveBeenCalledWith("https://ex.test/uncached");
      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it("charge et renvoie l'analyse en cache sans appeler le LLM", async () => {
      const cachedAnalysis = {
        summary: "Résumé en cache",
        clickbait_gap: "Décalage titre",
        blind_spot: "Angle mort",
        annotations: [annotation("c1")],
      };
      mockGetCachedByUrl.mockResolvedValueOnce({
        analysis: cachedAnalysis,
        textHash: "h1",
        provider: "openai",
        model: "gpt-4o",
        lang: "fr",
        createdAt: 123456789,
      });

      const res = await loadCachedRun(12, "https://ex.test/cached-article");
      expect(res).not.toBeNull();
      expect(res?.status).toBe("done");
      expect(res?.summary).toBe("Résumé en cache");
      expect(res?.clickbaitGap).toBe("Décalage titre");
      expect(res?.blindSpot).toBe("Angle mort");
      expect(res?.cachedAt).toBe(123456789);
      // Entrée produite avec d'autres réglages : réaffichée, mais signalée (D11).
      expect(res?.stale).toBe(true);
      expect(res?.annotations).toHaveLength(1);
      expect(mockAnalyze).not.toHaveBeenCalled();
      expect(tabMessages.some((m) => m.type === "highlight")).toBe(true);
      expect(getSnapshot(12)).toEqual(res);
    });

    it("ne signale pas comme obsolète une analyse produite avec les réglages courants", async () => {
      mockGetCachedByUrl.mockResolvedValueOnce({
        analysis: { summary: "S", annotations: [] },
        textHash: "h",
        ...analysisSettings(config),
        createdAt: 1,
      });
      const res = await loadCachedRun(40, "https://ex.test/fresh");
      expect(res?.stale).toBe(false);
    });

    it("charge et renvoie l'analyse d'une vidéo YouTube en cache avec alignement temporel", async () => {
      const cachedAnalysis = {
        summary: "Résumé YouTube en cache",
        clickbait_gap: null,
        blind_spot: null,
        annotations: [{ ...annotation("yt-c1"), exact_quote: "citation ann-yt-1" }],
      };
      mockGetCachedByUrl.mockResolvedValueOnce({
        analysis: cachedAnalysis,
        textHash: "h-yt",
        provider: "openai",
        model: "gpt-4o",
        lang: "fr",
        createdAt: 999999999,
        isVideo: true,
        videoAnnotations: [
          {
            ...annotation("yt-c1"),
            exact_quote: "citation ann-yt-1",
            startTime: 42.5,
            endTime: 48.0,
          },
        ],
        analyzedRanges: [{ startSec: 0, endSec: 900 }],
        videoChunkRange: { startSec: 0, endSec: 900 },
        videoTotalDuration: 1200,
      });

      const res = await loadCachedRun(13, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(res).not.toBeNull();
      expect(res?.status).toBe("done");
      expect(res?.isVideo).toBe(true);
      expect(res?.videoChunkRange).toEqual({ startSec: 0, endSec: 900 });
      expect(res?.annotations[0]).toMatchObject({ startTime: 42.5, endTime: 48.0 });
      expect(tabMessages.some((m) => m.type === "youtube-highlight")).toBe(true);
      expect(tabMessages.some((m) => m.type === "youtube-set-options")).toBe(true);
    });

    it("ré-aligne dynamiquement une analyse YouTube en cache sans videoAnnotations", async () => {
      youtubeExtractResponse = {
        ok: true,
        extracted: {
          title: "Vidéo Test",
          lang: "fr",
          paragraphs: ["citation ann-yt-1 dans la transcription."],
        },
        slice: {
          index: 0,
          startSec: 0,
          endSec: 900,
          cues: [{ text: "citation ann-yt-1 dans la transcription.", startMs: 15000, endMs: 20000 }],
        },
        transcript: {
          videoId: "dQw4w9WgXcQ",
          language: "fr",
          durationMs: 1200000,
          cues: [],
        },
      };

      const cachedAnalysis = {
        summary: "Analyse brute sans timestamps",
        clickbait_gap: null,
        blind_spot: null,
        annotations: [{ ...annotation("yt-c2"), exact_quote: "citation ann-yt-1" }],
      };
      mockGetCachedByUrl.mockResolvedValueOnce({
        analysis: cachedAnalysis,
        textHash: "h-yt2",
        provider: "openai",
        model: "gpt-4o",
        lang: "fr",
        createdAt: 888888888,
      });

      const res = await loadCachedRun(14, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(res).not.toBeNull();
      expect(res?.status).toBe("done");
      expect(res?.isVideo).toBe(true);
      expect(res?.annotations[0]?.id).toBe("yt-c2");
      // startTime doit être aligné à 15s (15000 ms)
      expect((res?.annotations[0] as any).startTime).toBe(15);
      expect(mockPutCached).toHaveBeenCalled();
      expect(tabMessages.some((m) => m.type === "youtube-highlight")).toBe(true);
    });
  });
});
