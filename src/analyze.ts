// Orchestration d'une analyse : découpage (D6), appels au provider, validation,
// politique des sources (D3), fusion.

import { chunkParagraphs, mapLimit, mergeAnalyses } from "./chunking";
import { resolveLanguage, type Config, type ProviderId } from "./config";
import type { Extracted } from "./messages";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { openAiCompatibleProvider } from "./providers/openai-compatible";
import type { LlmProvider, StreamCallbacks } from "./providers/types";
import { enforceSourcePolicy, validateAnalysis, type Analysis, type Annotation } from "./schema";

const PROVIDERS: Record<ProviderId, LlmProvider> = {
  anthropic: anthropicProvider,
  "openai-compatible": openAiCompatibleProvider,
  gemini: geminiProvider,
};

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
}

export async function analyzeArticle(
  article: Extracted,
  config: Config,
  signal: AbortSignal,
  callbacks?: ((p: Progress) => void) | AnalyzeCallbacks,
): Promise<Analysis> {
  const cb: AnalyzeCallbacks = typeof callbacks === "function" ? { onProgress: callbacks } : (callbacks ?? {});
  const notifyProgress = (p: Progress) => cb.onProgress?.(p);

  const provider = PROVIDERS[config.provider];
  const webSearch = config.webSearch && provider.supportsWebSearch(config);
  const language = resolveLanguage(config);
  const chunks = chunkParagraphs(article.paragraphs, config.maxChunkTokens);
  let done = 0;
  notifyProgress({ phase: "analyzing", done, total: chunks.length });

  const parts = await mapLimit(chunks, CONCURRENCY, async (text, index) => {
    const onStream: StreamCallbacks | undefined =
      cb.onSummary || cb.onAnnotation
        ? {
            onSummary: (summary, isComplete) => {
              if (chunks.length === 1) {
                cb.onSummary?.(summary, isComplete);
              }
            },
            onAnnotation: (a) => {
              cb.onAnnotation?.(a);
            },
          }
        : undefined;

    const result = await provider.analyze(
      { title: article.title, text, part: { index, total: chunks.length }, language, webSearch, onStream },
      config,
      signal,
    );
    const analysis = enforceSourcePolicy(validateAnalysis(result.raw), webSearch ? result.searchedUrls : undefined);
    notifyProgress({ phase: "analyzing", done: ++done, total: chunks.length });
    return analysis;
  });

  const merged = mergeAnalyses(parts);
  if (parts.length > 1 && provider.consolidateSummary) {
    notifyProgress({ phase: "consolidating", done: parts.length, total: parts.length });
    try {
      const partialSummaries = parts.map((p) => p.summary.trim()).filter(Boolean);
      if (partialSummaries.length > 1) {
        const onProgressText = cb.onSummary ? (text: string) => cb.onSummary?.(text, false) : undefined;
        merged.summary = onProgressText
          ? await provider.consolidateSummary(article.title, partialSummaries, language, config, signal, onProgressText)
          : await provider.consolidateSummary(article.title, partialSummaries, language, config, signal);
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
