// Orchestration d'une analyse : cartographie (B1), découpage (D6), appels au
// provider, validation, politique des sources (D3), fusion, consolidation des
// éléments globaux (B2) et relecture (Q2). Cartographie et relecture ne sont faites
// qu'en mode approfondi (D10).

import { chunkParagraphs, mapSettled, mergeAnalyses, outlineSource, renumber } from "./chunking";
import { resolveLanguage, type Config, type ProviderId } from "./config";
import { webSearchEnabled } from "./engine-settings";
import type { Extracted } from "./messages";
import { consolidatePrompt, mapPrompt, reviewPrompt, type ArticleMeta, type ReviewItem } from "./prompt";
import { PROVIDERS } from "./providers";
import type { RetryInfo } from "./providers/http";
import type { CompletionRequest, StreamCallbacks } from "./providers/types";
import { ProgressiveJsonParser, parseJsonObject } from "./streaming-json";
import { normalizeWithMap } from "./text-match";
import type { TokenUsage } from "./tokens";
import {
  enforceAnnotationSourcePolicy,
  enforceSourcePolicy,
  validateAnalysis,
  type Analysis,
  type Annotation,
} from "./schema";

const CONCURRENCY = 2;

/**
 * Taille maximale du texte soumis à la cartographie (B1). Les modèles hébergés par
 * Anthropic et Google ont une large fenêtre ; pour un modèle local ou un endpoint
 * quelconque, la seule indication est la taille de morceau choisie par l'utilisateur.
 */
function outlineBudget(provider: ProviderId, maxChunkTokens: number): number {
  return provider === "anthropic" || provider === "gemini" ? 100_000 : maxChunkTokens;
}

/** Longueur maximale du contexte d'une annotation transmis à la relecture (Q2). */
const REVIEW_CONTEXT_CHARS = 800;

export type AnalysisPhase = "mapping" | "analyzing" | "consolidating" | "reviewing";

export interface Progress {
  phase?: AnalysisPhase;
  done: number;
  total: number;
}

export interface AnalyzeCallbacks {
  onProgress?: (p: Progress) => void;
  onSummary?: (summary: string, isComplete: boolean) => void;
  onAnnotation?: (annotation: Annotation) => void;
  onUsage?: (usage: TokenUsage) => void;
  onRetry?: (info: RetryInfo) => void;
}

/** Morceau dont l'analyse a échoué (A3). */
export interface SkippedPart {
  index: number;
  /** Début du premier paragraphe du morceau, pour le désigner à l'utilisateur. */
  excerpt: string;
}

/** Analyse fusionnée ; `skipped` liste les morceaux non analysés d'une analyse partielle. */
export interface EngineAnalysis extends Analysis {
  skipped?: SkippedPart[];
}

const EXCERPT_CHARS = 120;

function excerptOf(chunk: string): string {
  const first = chunk.split("\n\n")[0]!.trim();
  return first.length > EXCERPT_CHARS ? `${first.slice(0, EXCERPT_CHARS).trimEnd()}…` : first;
}

function metaOf(article: Extracted): ArticleMeta | undefined {
  const { publishedTime, byline, siteName } = article;
  return publishedTime || byline || siteName ? { publishedTime, byline, siteName } : undefined;
}

/**
 * Passe facultative : en cas d'échec, l'analyse continue sans elle. Une annulation
 * reste une annulation.
 */
async function optional<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (signal.aborted) throw err;
    console.warn("Rhetorix: passe facultative ignorée :", err);
    return undefined;
  }
}

/** Paragraphe de l'article qui contient la citation, réduit autour d'elle s'il est long. */
export function quoteContext(quote: string, paragraphs: string[]): string | undefined {
  const q = normalizeWithMap(quote).norm;
  if (!q) return undefined;
  for (const p of paragraphs) {
    const { norm, map } = normalizeWithMap(p);
    const i = norm.indexOf(q);
    if (i < 0) continue;
    if (p.length <= REVIEW_CONTEXT_CHARS) return p;
    const start = map[i]!;
    const end = map[i + q.length - 1]! + 1;
    const margin = Math.max(0, Math.floor((REVIEW_CONTEXT_CHARS - (end - start)) / 2));
    const from = Math.max(0, start - margin);
    const to = Math.min(p.length, end + margin);
    return `${from > 0 ? "…" : ""}${p.slice(from, to)}${to < p.length ? "…" : ""}`;
  }
  return undefined;
}

export async function analyzeArticle(
  article: Extracted,
  config: Config,
  signal: AbortSignal,
  callbacks?: AnalyzeCallbacks,
): Promise<EngineAnalysis> {
  const cb = callbacks ?? {};
  const provider = PROVIDERS[config.provider];
  const webSearch = webSearchEnabled(config);
  const language = resolveLanguage(config);
  const deep = config.analysisDepth === "deep";
  const meta = metaOf(article);
  const analysisDate = new Date().toISOString().slice(0, 10);
  const chunks = chunkParagraphs(article.paragraphs, config.maxChunkTokens);

  // Consommation cumulée de tous les appels, publiée à chaque mise à jour.
  const usages = new Map<string, TokenUsage>();
  const setUsage = (key: string, usage: TokenUsage) => {
    usages.set(key, usage);
    let inTok = 0;
    let outTok = 0;
    for (const u of usages.values()) {
      inTok += u.inputTokens;
      outTok += u.outputTokens;
    }
    cb.onUsage?.({ inputTokens: inTok, outputTokens: outTok, totalTokens: inTok + outTok });
  };
  const complete = (key: string, request: CompletionRequest, onText?: (text: string) => void) =>
    provider.complete(request, config, signal, { onText, onUsage: (u) => setUsage(key, u), onRetry: cb.onRetry });

  // B1 : plan de l'article entier, joint à chaque morceau.
  let outline: string | undefined;
  if (deep && chunks.length > 1) {
    cb.onProgress?.({ phase: "mapping", done: 0, total: chunks.length });
    const source = outlineSource(article.paragraphs, outlineBudget(config.provider, config.maxChunkTokens));
    outline = await optional(signal, () => complete("mapping", { ...mapPrompt(article.title, source.text, meta, source.truncated), maxTokens: 1000 }));
  }

  let done = 0;
  cb.onProgress?.({ phase: "analyzing", done, total: chunks.length });

  const settled = await mapSettled(
    chunks,
    CONCURRENCY,
    async (text, index) => {
      const onStream: StreamCallbacks | undefined =
        cb.onSummary || cb.onAnnotation || cb.onUsage || cb.onRetry
          ? {
              onSummary: (summary, isComplete) => {
                if (chunks.length === 1) {
                  cb.onSummary?.(summary, isComplete);
                }
              },
              onAnnotation: (a) => {
                const id = chunks.length > 1 ? `p${index + 1}-${a.id}` : a.id;
                const safe = !webSearch ? enforceAnnotationSourcePolicy(a, undefined) : a;
                cb.onAnnotation?.({ ...safe, id });
              },
              onUsage: (usage) => setUsage(`part-${index}`, usage),
              onRetry: cb.onRetry,
            }
          : undefined;

      const result = await provider.analyze(
        {
          title: article.title,
          text,
          part: { index, total: chunks.length },
          language,
          webSearch,
          meta,
          analysisDate,
          outline,
          onStream,
        },
        config,
        signal,
      );
      if (result.usage) setUsage(`part-${index}`, result.usage);
      const analysis = enforceSourcePolicy(validateAnalysis(result.raw), webSearch ? result.searchedUrls : undefined);
      cb.onProgress?.({ phase: "analyzing", done: ++done, total: chunks.length });
      return analysis;
    },
    signal,
  );

  // A3 : un morceau en échec n'annule pas les autres. L'analyse échoue si tous
  // échouent ; une annulation reste une annulation.
  if (signal.aborted) throw signal.reason;
  const parts = settled.flatMap((r) => (r.ok ? [r.value] : []));
  const firstFailure = settled.find((r) => !r.ok);
  if (parts.length === 0) throw firstFailure && !firstFailure.ok ? firstFailure.error : new Error("Aucun morceau analysé.");
  const skipped = settled.flatMap((r, index) => (r.ok ? [] : [{ index, excerpt: excerptOf(chunks[index]!) }]));

  const merged: EngineAnalysis = mergeAnalyses(parts);
  if (skipped.length > 0) merged.skipped = skipped;

  // B2 : résumé, décalage titre / contenu et angle mort jugés sur l'ensemble.
  if (parts.length > 1) {
    cb.onProgress?.({ phase: "consolidating", done: parts.length, total: parts.length });
    const doc = await optional(signal, () => consolidate(parts));
    if (doc) Object.assign(merged, doc);
  }
  cb.onSummary?.(merged.summary, true);

  // Q2 : relecture des annotations.
  if (deep && merged.annotations.length > 0) {
    cb.onProgress?.({ phase: "reviewing", done: parts.length, total: parts.length });
    const rejected = await optional(signal, () => review(merged.annotations));
    if (rejected?.size) {
      const kept = renumber({ ...merged, annotations: merged.annotations.filter((a) => !rejected.has(a.id)) });
      merged.annotations = kept.annotations;
    }
  }
  return merged;

  async function consolidate(partials: Analysis[]): Promise<Pick<Analysis, "summary" | "clickbait_gap" | "blind_spot"> | undefined> {
    let seen = 0;
    const parser = new ProgressiveJsonParser({ onSummary: (s) => cb.onSummary?.(s, false) });
    const text = await complete("consolidation", { ...consolidatePrompt(article.title, partials, language, outline), json: true }, (t) => {
      parser.feed(t.slice(seen));
      seen = t.length;
    });
    const out = parseJsonObject(text);
    if (!out || typeof out.summary !== "string" || !out.summary.trim()) return undefined;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return { summary: out.summary.trim(), clickbait_gap: str(out.clickbait_gap), blind_spot: str(out.blind_spot) };
  }

  async function review(annotations: Annotation[]): Promise<Set<string>> {
    const items: ReviewItem[] = annotations.map((a) => ({
      id: a.id,
      category: a.category,
      label: a.label,
      quote: a.exact_quote,
      critique: a.rhetoric_critique,
      context: quoteContext(a.exact_quote, article.paragraphs),
    }));
    const text = await complete("review", { ...reviewPrompt(article.title, items, outline), json: true, maxTokens: 2000 });
    const out = parseJsonObject(text);
    const ids = new Set(annotations.map((a) => a.id));
    const rejected = Array.isArray(out?.rejected) ? out.rejected : [];
    return new Set(
      rejected
        .map((r) => (typeof r === "string" ? r : typeof r === "object" && r !== null ? (r as { id?: unknown }).id : undefined))
        .filter((id): id is string => typeof id === "string" && ids.has(id)),
    );
  }
}
