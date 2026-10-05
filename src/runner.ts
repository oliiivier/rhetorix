// Pilotage d'une analyse depuis le script de fond (décision D9) : injection du
// content script, extraction, cache (D7), appel au LLM, surlignage. Le panneau
// (desktop) et les bulles (mobile) ne sont que des vues de l'état publié ici.

import { analyzeArticle, metaOf, quoteContext, type EngineAnalysis } from "./analyze";
import { cacheKey, getCached, getCachedByUrl, putCached, sha256, updateCachedFactCheck } from "./cache";
import { addContested, contestKey, removeContested } from "./contested";
import { isConfigured, loadConfig, resolveLanguage, type DisplayMode } from "./config";
import { analysisSettings, sameSettings, type AnalysisSettings } from "./engine-settings";
import { ext } from "./ext";
import { formatErrorMessage, getUiStrings } from "./i18n";
import type { ExtractResult, HighlightResult, PanelToContent, RunSnapshot, YouTubeExtractResult } from "./messages";
import type { ArticleMeta } from "./prompt";
import { isDocumentLevel, isVerifiable, type Annotation } from "./schema";
import { recordTokenUsage, type TokenUsage } from "./tokens";
import { canVerifyOnDemand, verifyAnnotation } from "./verify";
import { isYouTubeWatchUrl } from "./youtube/youtube-detector";
import { matchAnnotationsToCues } from "./youtube/youtube-matcher";
import type { TimeRange, VideoAnnotation } from "./youtube/types";

/** Sans activité d'API, le script de fond est suspendu au bout d'environ 30 s. */
const KEEPALIVE_MS = 20_000;

interface Run {
  snapshot: RunSnapshot;
  controller: AbortController;
  /** Clé de l'entrée de cache de l'analyse, à compléter après une vérification (C2). */
  cacheKey?: string;
  /** Article analysé : ancre des annotations d'ensemble (B3) et contexte des vérifications (C2). */
  article?: { title: string; meta?: ArticleMeta; paragraphs?: string[] };
  /** Réglages du moteur qui ont produit l'analyse, joints à une contestation (Q4). */
  settings?: Partial<AnalysisSettings>;
  /** Vérifications à la demande en cours, annulées avec l'onglet. */
  verifications?: AbortController;
}

export type UpdateListener = (snapshot: RunSnapshot) => void;

export interface RunOptions {
  force: boolean;
  /** Impose un mode d'affichage (mobile : bulles seules). Sinon, celui de la configuration. */
  displayMode?: DisplayMode;
  youtubeChunkStartSec?: number;
  youtubeFull?: boolean;
}

const runs = new Map<number, Run>();

export function getSnapshot(tabId: number): RunSnapshot | null {
  return runs.get(tabId)?.snapshot ?? null;
}

export async function loadCachedRun(tabId: number, url: string | undefined): Promise<RunSnapshot | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const existing = runs.get(tabId)?.snapshot;
  if (existing && existing.status !== "error") {
    return existing;
  }

  const cached = await getCachedByUrl(url);
  if (!cached || !cached.analysis) {
    return null;
  }

  const config = await loadConfig();
  const lang = resolveLanguage(config);
  const t = getUiStrings(config);
  // D11 : l'analyse est réaffichée sans ré-extraction ; si les réglages du moteur ont
  // changé depuis, elle est signalée comme peut-être obsolète.
  const stale = !sameSettings(cached, analysisSettings(config));
  const tab = await ext.tabs.get(tabId).catch(() => null);
  const article = { title: cached.title ?? tab?.title ?? "", meta: cached.meta };

  const isYouTube = Boolean(url && isYouTubeWatchUrl(url));
  if (isYouTube) {
    try {
      await injectYouTube(tabId, t.accessErrorStatus);
    } catch {}

    let videoAnnotations = cached.videoAnnotations;
    let analyzedRanges: TimeRange[] = cached.analyzedRanges ?? [];
    let videoChunkRange = cached.videoChunkRange;
    let videoTotalDuration = cached.videoTotalDuration;

    // Si les videoAnnotations sont absentes ou non alignées (cache historique),
    // on extrait la transcription de la vidéo pour ré-aligner les cues et timestamps !
    const needsAlignment =
      !videoAnnotations ||
      videoAnnotations.length === 0 ||
      videoAnnotations.every((a) => a.startTime === undefined || a.startTime < 0);

    if (needsAlignment) {
      try {
        const startSec = 0;
        const durationSec = (config.youtubeChunkMinutes || 15) * 60;
        const extracted = await sendToTab<YouTubeExtractResult>(tabId, {
          type: "youtube-extract",
          startSec,
          durationSec,
        });
        if (extracted?.ok) {
          article.title = cached.title ?? extracted.extracted.title;
          videoAnnotations = matchAnnotationsToCues(cached.analysis.annotations, extracted.slice.cues, 0);
          const range: TimeRange = { startSec: extracted.slice.startSec, endSec: extracted.slice.endSec };
          analyzedRanges = [range];
          videoChunkRange = range;
          videoTotalDuration = extracted.transcript.durationMs / 1000;
          await putCached(url, {
            ...cached,
            isVideo: true,
            videoAnnotations,
            analyzedRanges,
            videoChunkRange,
            videoTotalDuration,
          });
        }
      } catch (err) {
        console.warn("Rhetorix: could not align cached video annotations:", err);
      }
    }

    const annotationsToUse = videoAnnotations ?? cached.analysis.annotations;

    try {
      await sendToTab(tabId, {
        type: "youtube-set-options",
        options: {
          minDisplayDuration: config.youtubeMinDisplayDuration,
          pauseMode: config.youtubePauseMode,
          autoResume: config.youtubeAutoResume,
          autoResumeDuration: config.youtubeAutoResumeDuration,
        },
      });

      if (videoAnnotations) {
        await sendToTab(tabId, {
          type: "youtube-highlight",
          annotations: videoAnnotations,
          analyzedRanges,
          lang,
          documentAnnotations: cached.analysis.annotations.filter(isDocumentLevel),
        });
      }
    } catch {}

    const snapshot: RunSnapshot = {
      tabId,
      url,
      status: "done",
      phase: "consolidating",
      done: 1,
      total: 1,
      summary: cached.analysis.summary,
      clickbaitGap: cached.analysis.clickbait_gap,
      blindSpot: cached.analysis.blind_spot,
      annotations: annotationsToUse,
      unlocated: videoAnnotations ? unlocatedInVideo(videoAnnotations) : [],
      cachedAt: cached.createdAt,
      stale,
      canVerify: canVerifyOnDemand(config),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      isVideo: true,
      videoChunkRange,
      videoTotalDuration,
      analyzedRanges,
    };

    const controller = new AbortController();
    runs.set(tabId, { snapshot, controller, cacheKey: cached.cacheKey, article, settings: cached });
    return snapshot;
  }

  let unlocated: string[] = [];
  let titleLocated: boolean | undefined;
  try {
    await inject(tabId, "access_error");
    const res = await sendToTab<HighlightResult>(tabId, {
      type: "highlight",
      annotations: cached.analysis.annotations,
      displayMode: config.displayMode,
      lang,
      title: article.title,
      canVerify: canVerifyOnDemand(config),
    });
    unlocated = res.unlocated ?? [];
    titleLocated = res.titleLocated;
  } catch {
    // Si l'injection échoue, l'analyse reste consultable dans le panneau
  }

  const snapshot: RunSnapshot = {
    tabId,
    url,
    status: "done",
    phase: "consolidating",
    done: 1,
    total: 1,
    summary: cached.analysis.summary,
    clickbaitGap: cached.analysis.clickbait_gap,
    blindSpot: cached.analysis.blind_spot,
    annotations: cached.analysis.annotations,
    unlocated,
    titleLocated,
    cachedAt: cached.createdAt,
    stale,
    canVerify: canVerifyOnDemand(config),
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };

  const controller = new AbortController();
  runs.set(tabId, { snapshot, controller, cacheKey: cached.cacheKey, article, settings: cached });
  return snapshot;
}

/** Annotations de passage non alignées sur la transcription ; les annotations d'ensemble n'en sont pas. */
function unlocatedInVideo(annotations: { id: string; exact_quote: string; startTime: number }[]): string[] {
  return annotations.filter((a) => a.startTime < 0 && !isDocumentLevel(a)).map((a) => a.id);
}

function withoutSkipped<T extends { skipped?: unknown }>(analysis: T): Omit<T, "skipped"> {
  const { skipped: _skipped, ...rest } = analysis;
  return rest;
}

export function isRunning(tabId: number): boolean {
  return runs.get(tabId)?.snapshot.status === "running";
}

export function cancelRun(tabId: number): void {
  runs.get(tabId)?.controller.abort();
}

function abortVerifications(tabId: number): void {
  runs.get(tabId)?.verifications?.abort();
}

/** Onglet fermé ou rechargé : l'analyse en cours est abandonnée et l'état oublié. */
export function forgetTab(tabId: number): void {
  cancelRun(tabId);
  abortVerifications(tabId);
  runs.delete(tabId);
}

export function sendToTab<R>(tabId: number, msg: PanelToContent): Promise<R> {
  return ext.tabs.sendMessage(tabId, msg) as Promise<R>;
}

async function inject(tabId: number, accessError: string): Promise<void> {
  try {
    await ext.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
    await ext.scripting.insertCSS({ target: { tabId }, files: ["highlights.css"] });
  } catch {
    throw new Error(accessError);
  }
}

async function injectYouTube(tabId: number, accessError: string): Promise<void> {
  try {
    await ext.scripting.executeScript({ target: { tabId }, files: ["content-script-youtube.js"] });
    // Surlignage du titre de la vidéo, ancre des annotations d'ensemble (B3).
    await ext.scripting.insertCSS({ target: { tabId }, files: ["highlights.css"] });
  } catch {
    throw new Error(accessError);
  }
}

export async function runAnalysis(tabId: number, url: string | undefined, opts: RunOptions, onUpdate: UpdateListener): Promise<RunSnapshot> {
  forgetTab(tabId);
  const controller = new AbortController();
  const snapshot: RunSnapshot = {
    tabId,
    url,
    status: "running",
    phase: "extracting",
    done: 0,
    total: 0,
    summary: "",
    annotations: [],
    unlocated: [],
  };
  const run: Run = { snapshot, controller };
  runs.set(tabId, run);
  const publish = () => {
    // Un onglet oublié entre-temps (rechargé, fermé) ne publie plus rien.
    if (runs.get(tabId) === run) onUpdate({ ...snapshot, annotations: [...snapshot.annotations] });
  };

  const keepAlive = setInterval(() => void ext.runtime.getPlatformInfo(), KEEPALIVE_MS);
  const config = await loadConfig();
  const t = getUiStrings(config);
  run.settings = analysisSettings(config);
  let currentUsage: TokenUsage | undefined;
  try {
    if (!isConfigured(config)) throw new Error(t.needConfigStatus);
    publish();
    if (url && !/^https?:\/\//i.test(url)) throw new Error(t.accessErrorStatus);

    const isYouTube = Boolean(url && isYouTubeWatchUrl(url));
    if (isYouTube) {
      await injectYouTube(tabId, t.accessErrorStatus);
      await sendToTab(tabId, {
        type: "youtube-set-options",
        options: {
          minDisplayDuration: config.youtubeMinDisplayDuration,
          pauseMode: config.youtubePauseMode,
          autoResume: config.youtubeAutoResume,
          autoResumeDuration: config.youtubeAutoResumeDuration,
        },
      });

      const startSec = opts.youtubeChunkStartSec ?? 0;
      const durationSec = opts.youtubeFull ? 999999 : (config.youtubeChunkMinutes || 15) * 60;

      const extracted = await sendToTab<YouTubeExtractResult>(tabId, {
        type: "youtube-extract",
        startSec,
        durationSec,
      });

      if (!extracted.ok) {
        throw new Error(extracted.error);
      }

      const article = extracted.extracted;
      run.article = { title: article.title, paragraphs: article.paragraphs };
      const lang = resolveLanguage(config);
      const videoUrl = url!;
      const chunkTag = opts.youtubeFull ? "full" : `${startSec}-${durationSec}`;
      const cacheUrl = opts.youtubeFull
        ? `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}rhetorix_chunk=full`
        : (startSec === 0 ? videoUrl : `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}rhetorix_chunk=${chunkTag}`);
      const fingerprint = {
        textHash: await sha256(article.paragraphs.join("\n\n")),
        ...analysisSettings(config),
      };

      const cached = !opts.force ? await getCached(cacheUrl, fingerprint) : null;
      let analysis: EngineAnalysis | undefined = cached?.analysis;
      if (!analysis) {
        snapshot.phase = "analyzing";
        publish();
        analysis = await analyzeArticle(article, config, controller.signal, {
          onProgress: ({ phase, done, total }) => {
            snapshot.retrying = false;
            snapshot.phase = phase ?? "analyzing";
            snapshot.done = done;
            snapshot.total = total;
            publish();
          },
          onSummary: (summary) => {
            snapshot.summary = summary;
            publish();
          },
          onAnnotation: (a) => {
            snapshot.annotations.push(a);
            publish();
          },
          onUsage: (usage) => {
            currentUsage = usage;
            snapshot.usage = usage;
            publish();
          },
          onRetry: () => {
            snapshot.retrying = true;
            publish();
          },
        });
        if (currentUsage) {
          await recordTokenUsage(currentUsage);
        }
      } else {
        snapshot.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      }

      const videoAnnotations = matchAnnotationsToCues(analysis.annotations, extracted.slice.cues, 0);
      const analyzedRange: TimeRange = { startSec: extracted.slice.startSec, endSec: extracted.slice.endSec };

      await sendToTab(tabId, {
        type: "youtube-highlight",
        annotations: videoAnnotations,
        analyzedRanges: [analyzedRange],
        lang,
        documentAnnotations: analysis.annotations.filter(isDocumentLevel),
      });

      if (!analysis.skipped) {
        run.cacheKey = cacheKey(cacheUrl);
        await putCached(cacheUrl, {
        ...fingerprint,
        analysis: withoutSkipped(analysis),
        createdAt: cached?.createdAt ?? Date.now(),
        title: article.title,
        isVideo: true,
        videoAnnotations,
        analyzedRanges: [analyzedRange],
        videoChunkRange: analyzedRange,
        videoTotalDuration: extracted.transcript.durationMs / 1000,
        });
      }

      Object.assign(snapshot, {
        status: "done",
        summary: analysis.summary,
        clickbaitGap: analysis.clickbait_gap,
        blindSpot: analysis.blind_spot,
        annotations: videoAnnotations,
        unlocated: unlocatedInVideo(videoAnnotations),
        canVerify: canVerifyOnDemand(config),
        cachedAt: cached?.createdAt,
        skipped: analysis.skipped?.map((p) => p.excerpt),
        retrying: false,
        usage: snapshot.usage ?? currentUsage,
        isVideo: true,
        videoChunkRange: analyzedRange,
        videoTotalDuration: extracted.transcript.durationMs / 1000,
        analyzedRanges: [analyzedRange],
      } satisfies Partial<RunSnapshot>);
    } else {
      await inject(tabId, t.accessErrorStatus);
      const extracted = await sendToTab<ExtractResult>(tabId, { type: "extract" });
      if (!extracted.ok) {
        if (extracted.errorCode === "no_article") throw new Error(t.extractNoArticleError);
        if (extracted.errorCode === "empty_article") throw new Error(t.extractEmptyArticleError);
        throw new Error(extracted.error);
      }
      const article = extracted.article;
      run.article = { title: article.title, meta: metaOf(article), paragraphs: article.paragraphs };
      const lang = resolveLanguage(config);
      const fingerprint = {
        textHash: await sha256(article.paragraphs.join("\n\n")),
        ...analysisSettings(config),
      };
      const cached = !opts.force && url ? await getCached(url, fingerprint) : null;
      let analysis: EngineAnalysis | undefined = cached?.analysis;
      if (!analysis) {
        snapshot.phase = "analyzing";
        publish();
        analysis = await analyzeArticle(article, config, controller.signal, {
          onProgress: ({ phase, done, total }) => {
            snapshot.retrying = false;
            snapshot.phase = phase ?? "analyzing";
            snapshot.done = done;
            snapshot.total = total;
            publish();
          },
          onSummary: (summary) => {
            snapshot.summary = summary;
            publish();
          },
          onAnnotation: (a) => {
            snapshot.annotations.push(a);
            publish();
          },
          onUsage: (usage) => {
            currentUsage = usage;
            snapshot.usage = usage;
            publish();
          },
          onRetry: () => {
            snapshot.retrying = true;
            publish();
          },
        });
        // A3 : une analyse partielle n'est pas mise en cache, pour être retentée.
        if (url && !analysis.skipped) {
          await putCached(url, { ...fingerprint, analysis, createdAt: Date.now(), title: article.title, meta: run.article.meta });
        }
        if (currentUsage) {
          await recordTokenUsage(currentUsage);
        }
      } else {
        snapshot.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      }
      if (url && !analysis.skipped) run.cacheKey = cacheKey(url);

      const { unlocated, titleLocated } = await sendToTab<HighlightResult>(tabId, {
        type: "highlight",
        annotations: analysis.annotations,
        displayMode: opts.displayMode ?? config.displayMode,
        lang,
        title: article.title,
        canVerify: canVerifyOnDemand(config),
      });
      Object.assign(snapshot, {
        status: "done",
        summary: analysis.summary,
        clickbaitGap: analysis.clickbait_gap,
        blindSpot: analysis.blind_spot,
        annotations: analysis.annotations,
        unlocated,
        titleLocated,
        canVerify: canVerifyOnDemand(config),
        cachedAt: cached?.createdAt,
        skipped: analysis.skipped?.map((p) => p.excerpt),
        retrying: false,
        usage: snapshot.usage ?? currentUsage,
      } satisfies Partial<RunSnapshot>);
    }
  } catch (err) {
    // A3 : les annotations déjà reçues restent affichées et surlignées.
    snapshot.retrying = false;
    if (controller.signal.aborted) snapshot.status = "cancelled";
    else {
      snapshot.status = "error";
      snapshot.error = formatErrorMessage(err, t);
    }
    if (snapshot.annotations.length > 0 && !snapshot.isVideo && !(url && isYouTubeWatchUrl(url))) {
      try {
        const res = await sendToTab<HighlightResult>(tabId, {
          type: "highlight",
          annotations: snapshot.annotations,
          displayMode: opts.displayMode ?? config.displayMode,
          lang: resolveLanguage(config),
          title: run.article?.title,
          canVerify: canVerifyOnDemand(config),
        });
        snapshot.unlocated = res.unlocated ?? [];
        snapshot.titleLocated = res.titleLocated;
        snapshot.canVerify = canVerifyOnDemand(config);
      } catch {
        // Page inaccessible : les annotations restent consultables dans le panneau
      }
    }
  } finally {
    clearInterval(keepAlive);
  }
  publish();
  return snapshot;
}

// ---------- Après l'analyse : vérification à la demande (C2) et contestation (Q4) ----------

/** Paragraphe de l'allégation : texte extrait à l'analyse, sinon nouvelle extraction locale. */
async function claimParagraph(tabId: number, run: Run, quote: string): Promise<string | undefined> {
  let paragraphs = run.article?.paragraphs;
  if (!paragraphs && !run.snapshot.isVideo) {
    const extracted = await sendToTab<ExtractResult>(tabId, { type: "extract" }).catch(() => null);
    if (extracted?.ok) {
      paragraphs = extracted.article.paragraphs;
      run.article = { title: run.article?.title || extracted.article.title, meta: run.article?.meta ?? metaOf(extracted.article), paragraphs };
    }
  }
  return paragraphs ? quoteContext(quote, paragraphs) : undefined;
}

/**
 * Vérifie en ligne une allégation restée « non vérifiée » (C2), avec la recherche web
 * activée pour ce seul appel. Le résultat remplace la vérification dans l'état publié,
 * dans la page et dans le cache.
 */
export async function verifyRunAnnotation(tabId: number, id: string, onUpdate: UpdateListener): Promise<void> {
  const run = runs.get(tabId);
  if (!run || run.snapshot.status === "running") return;
  const snapshot = run.snapshot;
  const annotation = snapshot.annotations.find((a) => a.id === id);
  if (!annotation || !isVerifiable(annotation) || snapshot.verifying?.includes(id)) return;
  const config = await loadConfig();
  const t = getUiStrings(config);
  if (!canVerifyOnDemand(config)) return;

  const publish = (verifying: boolean, error?: string) => {
    if (runs.get(tabId) !== run) return;
    const current = snapshot.annotations.find((a) => a.id === id) ?? annotation;
    onUpdate({ ...snapshot, annotations: [...snapshot.annotations] });
    sendToTab(tabId, { type: "update-annotation", annotation: current, verifying, error }).catch(() => {});
  };
  run.verifications ??= new AbortController();
  const signal = run.verifications.signal;
  const keepAlive = setInterval(() => void ext.runtime.getPlatformInfo(), KEEPALIVE_MS);
  snapshot.verifying = [...(snapshot.verifying ?? []), id];
  if (snapshot.verifyErrors) delete snapshot.verifyErrors[id];
  publish(true);

  let usage: TokenUsage | undefined;
  try {
    const paragraph = await claimParagraph(tabId, run, annotation.exact_quote);
    const factCheck = await verifyAnnotation(
      annotation,
      { title: run.article?.title ?? "", paragraph, meta: run.article?.meta },
      config,
      signal,
      (u) => (usage = u),
    );
    snapshot.annotations = snapshot.annotations.map((a) => (a.id === id ? { ...a, fact_check: factCheck } : a));
    if (run.cacheKey) await updateCachedFactCheck(run.cacheKey, id, factCheck);
    snapshot.verifying = snapshot.verifying?.filter((v) => v !== id);
    publish(false);
  } catch (err) {
    snapshot.verifying = snapshot.verifying?.filter((v) => v !== id);
    if (signal.aborted) return;
    const message = formatErrorMessage(err, t);
    snapshot.verifyErrors = { ...snapshot.verifyErrors, [id]: message };
    publish(false, message);
  } finally {
    clearInterval(keepAlive);
    if (usage) await recordTokenUsage(usage);
  }
}

/**
 * Conteste une annotation (Q4) ou retire la contestation. L'annotation est enregistrée
 * localement avec les réglages qui l'ont produite ; rien n'est envoyé à un tiers.
 */
export async function contestRunAnnotation(tabId: number, id: string, contested: boolean): Promise<void> {
  const run = runs.get(tabId);
  const annotation = run?.snapshot.annotations.find((a) => a.id === id);
  const url = run?.snapshot.url;
  if (!run || !annotation || !url) return;
  const key = contestKey(url, annotation);
  if (!contested) {
    await removeContested(key);
    return;
  }
  const settings = { ...analysisSettings(await loadConfig()), ...run.settings };
  await addContested({
    key,
    url,
    pageTitle: run.article?.title ?? "",
    contestedAt: Date.now(),
    annotation: contestedData(annotation),
    engine: {
      provider: settings.provider,
      model: settings.model,
      engineVersion: settings.engineVersion,
      depth: settings.depth,
      lang: settings.lang,
      webSearch: settings.webSearch,
    },
  });
}

function contestedData(a: Annotation) {
  const { exact_quote, category, label, severity, confidence, rhetoric_critique, fact_check } = a;
  return { exact_quote, category, label, severity, confidence, rhetoric_critique, fact_check };
}
