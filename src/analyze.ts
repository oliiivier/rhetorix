// Orchestration d'une analyse : découpage (D6), appels au provider, validation,
// politique des sources (D3), fusion.

import { chunkParagraphs, mapLimit, mergeAnalyses } from "./chunking";
import { resolveLanguage, type Config } from "./config";
import { webSearchEnabled } from "./engine-settings";
import type { Extracted } from "./messages";
import { PROVIDERS } from "./providers";
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
}

export async function analyzeArticle(
  article: Extracted,
  config: Config,
  signal: AbortSignal,
  callbacks?: AnalyzeCallbacks,
): Promise<Analysis> {
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

  const parts = await mapLimit(chunks, CONCURRENCY, async (text, index) => {
    const onStream: StreamCallbacks | undefined =
      cb.onSummary || cb.onAnnotation || cb.onUsage
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
  });

  const merged = mergeAnalyses(parts);
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
