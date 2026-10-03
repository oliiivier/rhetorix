import type { Config } from "../config";
import type { Annotation } from "../schema";

export interface StreamCallbacks {
  onSummary?: (summary: string, isComplete: boolean) => void;
  onAnnotation?: (annotation: Annotation) => void;
}

export interface AnalyzeInput {
  title: string;
  text: string;
  part: { index: number; total: number };
  language: string;
  webSearch: boolean;
  onStream?: StreamCallbacks;
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
    onProgressText?: (text: string) => void,
  ): Promise<string>;
}

export type ProviderErrorCode =
  | "refusal"
  | "max_tokens"
  | "no_structured_output"
  | "too_many_turns"
  | "empty_response"
  | "invalid_json"
  | "empty_consolidated"
  | "blocked"
  | "http_error";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code?: ProviderErrorCode,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
