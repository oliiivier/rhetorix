import type { Config } from "../config";

export interface AnalyzeInput {
  title: string;
  text: string;
  part: { index: number; total: number };
  language: string;
  webSearch: boolean;
}

export interface ProviderResult {
  /** Sortie brute du modèle, à valider avec validateAnalysis. */
  raw: unknown;
  /**
   * URL renvoyées par l'outil de recherche web pendant l'appel (décision D3).
   * Absent quand aucune recherche web n'a été possible.
   */
  searchedUrls?: Set<string>;
}

export interface LlmProvider {
  supportsWebSearch(config: Config): boolean;
  analyze(input: AnalyzeInput, config: Config, signal: AbortSignal): Promise<ProviderResult>;
  consolidateSummary?(
    title: string,
    summaries: string[],
    language: string,
    config: Config,
    signal: AbortSignal,
  ): Promise<string>;
}

export class ProviderError extends Error {}
