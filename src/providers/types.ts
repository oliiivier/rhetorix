import type { Config } from "../config";
import type { ArticleMeta, Prompt } from "../prompt";
import type { Annotation } from "../schema";
import type { TokenUsage } from "../tokens";
import type { RetryInfo } from "./http";

export interface StreamCallbacks {
  onSummary?: (summary: string, isComplete: boolean) => void;
  onAnnotation?: (annotation: Annotation) => void;
  onUsage?: (usage: TokenUsage) => void;
  /** Statut passager reçu : nouvel essai après `delayMs` (A4). */
  onRetry?: (info: RetryInfo) => void;
}

export interface AnalyzeInput {
  title: string;
  text: string;
  part: { index: number; total: number };
  language: string;
  webSearch: boolean;
  /** Métadonnées de publication (C1). */
  meta?: ArticleMeta;
  /** Date de l'analyse (AAAA-MM-JJ), pour juger les allégations dans le temps (C1). */
  analysisDate?: string;
  /** Plan de l'article entier, joint à chaque morceau en mode approfondi (B1). */
  outline?: string;
  onStream?: StreamCallbacks;
}

/** Appel textuel : consolidation, cartographie, relecture, vérification à la demande. */
export interface CompletionRequest extends Prompt {
  /** Réponse attendue en JSON : mode JSON du provider s'il en a un. */
  json?: boolean;
  maxTokens?: number;
  /**
   * Active la recherche web pour ce seul appel, quel que soit le réglage (C2). Les URL
   * renvoyées par l'outil de recherche sont signalées par `onSource` (D3).
   */
  webSearch?: boolean;
}

export interface CompletionCallbacks {
  /** Texte cumulé reçu jusqu'ici. */
  onText?: (text: string) => void;
  /** URL renvoyée par l'outil de recherche web (appel avec `webSearch`). */
  onSource?: (url: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onRetry?: (info: RetryInfo) => void;
}

export interface ProviderResult {
  /** Sortie brute du modèle, à valider avec validateAnalysis. */
  raw: unknown;
  /**
   * URL renvoyées par l'outil de recherche web pendant l'appel (décision D3).
   * Absent quand aucune recherche web n'a été possible.
   */
  searchedUrls?: Set<string>;
  /** Consommation de tokens mesurée pour cet appel (entrée, sortie, total). */
  usage?: TokenUsage;
}

export interface LlmProvider {
  supportsWebSearch(config: Config): boolean;
  /**
   * Vrai si un appel `complete` peut activer la recherche web à la demande (C2), même
   * quand le réglage de recherche web est désactivé.
   */
  searchesOnDemand(config: Config): boolean;
  analyze(input: AnalyzeInput, config: Config, signal: AbortSignal): Promise<ProviderResult>;
  complete(request: CompletionRequest, config: Config, signal: AbortSignal, callbacks?: CompletionCallbacks): Promise<string>;
}

export type ProviderErrorCode =
  | "refusal"
  | "max_tokens"
  | "no_structured_output"
  | "too_many_turns"
  | "empty_response"
  | "invalid_json"
  | "empty_completion"
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
