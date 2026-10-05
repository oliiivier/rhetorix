// Orchestration d'une analyse : découpage (D6), appels au provider, validation,
// politique des sources (D3), fusion.

import { chunkParagraphs, mapSettled, mergeAnalyses } from "./chunking";
import { resolveLanguage, type Config } from "./config";
import { webSearchEnabled } from "./engine-settings";
import type { Extracted } from "./messages";
import { PROVIDERS } from "./providers";
import type { RetryInfo } from "./providers/http";
import type { StreamCallbacks } from "./providers/types";
import type { TokenUsage } from "./tokens";
import {
  enforceAnnotationSourcePolicy,
  enforceSourcePolicy,
  validateAnalysis,
  type Analysis,
  type Annotation,
} from "./schema";

const CONCURRENCY = 2;

export interface Progress {
  phase?: "analyzing" | "consolidating";
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
  const chunks = chunkParagraphs(article.paragraphs, config.maxChunkTokens);
  let done = 0;
  cb.onProgress?.({ phase: "analyzing", done, total: chunks.length });

  const chunkUsages = new Map<number, TokenUsage>();
  let consolidationUsage: TokenUsage | undefined;

  const emitUsage = () => {
    let inTok = 0;
    let outTok = 0;
    for (const u of chunkUsages.values()) {
      inTok += u.inputTokens;
      outTok += u.outputTokens;
    }
    if (consolidationUsage) {
      inTok += consolidationUsage.inputTokens;
      outTok += consolidationUsage.outputTokens;
    }
    cb.onUsage?.({
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: inTok + outTok,
    });
  };

  const settled = await mapSettled(chunks, CONCURRENCY, async (text, index) => {
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
            onUsage: (usage) => {
              chunkUsages.set(index, usage);
              emitUsage();
            },
            onRetry: cb.onRetry,
          }
        : undefined;

    const result = await provider.analyze(
      { title: article.title, text, part: { index, total: chunks.length }, language, webSearch, onStream },
      config,
      signal,
    );
    if (result.usage) {
      chunkUsages.set(index, result.usage);
      emitUsage();
    }
    const analysis = enforceSourcePolicy(validateAnalysis(result.raw), webSearch ? result.searchedUrls : undefined);
    cb.onProgress?.({ phase: "analyzing", done: ++done, total: chunks.length });
    return analysis;
  }, signal);

  // A3 : un morceau en échec n'annule pas les autres. L'analyse échoue si tous
  // échouent ; une annulation reste une annulation.
  if (signal.aborted) throw signal.reason;
  const parts = settled.flatMap((r) => (r.ok ? [r.value] : []));
  const firstFailure = settled.find((r) => !r.ok);
  if (parts.length === 0) throw firstFailure && !firstFailure.ok ? firstFailure.error : new Error("Aucun morceau analysé.");
  const skipped = settled.flatMap((r, index) => (r.ok ? [] : [{ index, excerpt: excerptOf(chunks[index]!) }]));

  const merged: EngineAnalysis = mergeAnalyses(parts);
  if (skipped.length > 0) merged.skipped = skipped;
  if (parts.length > 1 && provider.consolidateSummary) {
    cb.onProgress?.({ phase: "consolidating", done: parts.length, total: parts.length });
    try {
      const partialSummaries = parts.map((p) => p.summary.trim()).filter(Boolean);
      if (partialSummaries.length > 1) {
        const onUsageCb = cb.onUsage
          ? (usage: TokenUsage) => {
              consolidationUsage = usage;
              emitUsage();
            }
          : undefined;
        merged.summary = await provider.consolidateSummary(
          article.title,
          partialSummaries,
          language,
          config,
          signal,
          cb.onSummary ? (text) => cb.onSummary?.(text, false) : undefined,
          ...(onUsageCb ? [onUsageCb] : []),
        );
        cb.onSummary?.(merged.summary, true);
      }
    } catch {
      // Repli gracieux sur le résumé concaténé de mergeAnalyses en cas d'erreur
    }
  } else if (parts.length === 1) {
    cb.onSummary?.(merged.summary, true);
  }
  return merged;
}
