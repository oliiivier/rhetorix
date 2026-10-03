// Orchestration d'une analyse : découpage (D6), appels au provider, validation,
// politique des sources (D3), fusion.

import { chunkParagraphs, mapLimit, mergeAnalyses } from "./chunking";
import { resolveLanguage, type Config, type ProviderId } from "./config";
import type { Extracted } from "./messages";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { openAiCompatibleProvider } from "./providers/openai-compatible";
import type { LlmProvider } from "./providers/types";
import { enforceSourcePolicy, validateAnalysis, type Analysis } from "./schema";

const PROVIDERS: Record<ProviderId, LlmProvider> = {
  anthropic: anthropicProvider,
  "openai-compatible": openAiCompatibleProvider,
  gemini: geminiProvider,
};

const CONCURRENCY = 2;

export interface Progress {
  done: number;
  total: number;
}

export async function analyzeArticle(
  article: Extracted,
  config: Config,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<Analysis> {
  const provider = PROVIDERS[config.provider];
  const webSearch = config.webSearch && provider.supportsWebSearch(config);
  const language = resolveLanguage(config);
  const chunks = chunkParagraphs(article.paragraphs, config.maxChunkTokens);
  let done = 0;
  onProgress({ done, total: chunks.length });

  const parts = await mapLimit(chunks, CONCURRENCY, async (text, index) => {
    const result = await provider.analyze(
      { title: article.title, text, part: { index, total: chunks.length }, language, webSearch },
      config,
      signal,
    );
    const analysis = enforceSourcePolicy(validateAnalysis(result.raw), webSearch ? result.searchedUrls : undefined);
    onProgress({ done: ++done, total: chunks.length });
    return analysis;
  });
  return mergeAnalyses(parts);
}
