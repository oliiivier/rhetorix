// Pilotage d'une analyse depuis le script de fond (décision D9) : injection du
// content script, extraction, cache (D7), appel au LLM, surlignage. Le panneau
// (desktop) et les bulles (mobile) ne sont que des vues de l'état publié ici.

import { analyzeArticle } from "./analyze";
import { getCached, getCachedByUrl, putCached, sha256 } from "./cache";
import { isConfigured, loadConfig, resolveLanguage, type DisplayMode } from "./config";
import { ext } from "./ext";
import { formatErrorMessage, getUiStrings } from "./i18n";
import type { ExtractResult, HighlightResult, PanelToContent, RunSnapshot } from "./messages";

/** Sans activité d'API, le script de fond est suspendu au bout d'environ 30 s. */
const KEEPALIVE_MS = 20_000;

interface Run {
  snapshot: RunSnapshot;
  controller: AbortController;
}

export type UpdateListener = (snapshot: RunSnapshot) => void;

export interface RunOptions {
  force: boolean;
  /** Impose un mode d'affichage (mobile : bulles seules). Sinon, celui de la configuration. */
  displayMode?: DisplayMode;
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

  let unlocated: string[] = [];
  try {
    await inject(tabId, "access_error");
    const res = await sendToTab<HighlightResult>(tabId, {
      type: "highlight",
      annotations: cached.analysis.annotations,
      displayMode: config.displayMode,
      lang,
    });
    unlocated = res.unlocated ?? [];
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
    cachedAt: cached.createdAt,
  };

  const controller = new AbortController();
  runs.set(tabId, { snapshot, controller });
  return snapshot;
}

export function isRunning(tabId: number): boolean {
  return runs.get(tabId)?.snapshot.status === "running";
}

export function cancelRun(tabId: number): void {
  runs.get(tabId)?.controller.abort();
}

/** Onglet fermé ou rechargé : l'analyse en cours est abandonnée et l'état oublié. */
export function forgetTab(tabId: number): void {
  cancelRun(tabId);
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
  try {
    if (!isConfigured(config)) throw new Error(t.needConfigStatus);
    publish();
    if (url && !/^https?:\/\//i.test(url)) throw new Error(t.accessErrorStatus);
    await inject(tabId, t.accessErrorStatus);
    const extracted = await sendToTab<ExtractResult>(tabId, { type: "extract" });
    if (!extracted.ok) {
      if (extracted.errorCode === "no_article") throw new Error(t.extractNoArticleError);
      if (extracted.errorCode === "empty_article") throw new Error(t.extractEmptyArticleError);
      throw new Error(extracted.error);
    }
    const article = extracted.article;
    const lang = resolveLanguage(config);
    const fingerprint = {
      textHash: await sha256(article.paragraphs.join("\n\n")),
      provider: config.provider,
      model: config.model,
      lang,
    };
    const cached = !opts.force && url ? await getCached(url, fingerprint) : null;
    let analysis = cached?.analysis;
    if (!analysis) {
      snapshot.phase = "analyzing";
      publish();
      analysis = await analyzeArticle(article, config, controller.signal, {
        onProgress: ({ phase, done, total }) => {
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
      });
      if (url) await putCached(url, { ...fingerprint, analysis, createdAt: Date.now() });
    }

    const { unlocated } = await sendToTab<HighlightResult>(tabId, {
      type: "highlight",
      annotations: analysis.annotations,
      displayMode: opts.displayMode ?? config.displayMode,
      lang,
    });
    Object.assign(snapshot, {
      status: "done",
      summary: analysis.summary,
      clickbaitGap: analysis.clickbait_gap,
      blindSpot: analysis.blind_spot,
      annotations: analysis.annotations,
      unlocated,
      cachedAt: cached?.createdAt,
    } satisfies Partial<RunSnapshot>);
  } catch (err) {
    snapshot.annotations = [];
    if (controller.signal.aborted) snapshot.status = "cancelled";
    else {
      snapshot.status = "error";
      snapshot.error = formatErrorMessage(err, t);
    }
  } finally {
    clearInterval(keepAlive);
  }
  publish();
  return snapshot;
}
