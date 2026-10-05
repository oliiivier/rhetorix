// Réglages dont dépend le résultat d'une analyse : partie configuration de
// l'empreinte du cache (A1, architecture §8).

import { resolveLanguage, type AnalysisDepth, type Config } from "./config";
import { PROVIDERS } from "./providers";

/**
 * Version du moteur d'analyse. À incrémenter à chaque modification du prompt, du
 * schéma, de la taxonomie ou des passes d'analyse : les analyses en cache produites
 * par une version antérieure ne sont plus réutilisées et sont signalées comme
 * peut-être obsolètes (D11).
 */
export const ENGINE_VERSION = 8;

export interface AnalysisSettings {
  provider: string;
  model: string;
  lang: string;
  engineVersion: number;
  /** Recherche web effectivement utilisée (réglage activé et proposée par le provider). */
  webSearch: boolean;
  maxChunkTokens: number;
  /** Profondeur d'analyse (D10). */
  depth: AnalysisDepth;
}

export function webSearchEnabled(config: Config): boolean {
  return config.webSearch && PROVIDERS[config.provider].supportsWebSearch(config);
}

export function analysisSettings(config: Config): AnalysisSettings {
  return {
    provider: config.provider,
    model: config.model,
    lang: resolveLanguage(config),
    engineVersion: ENGINE_VERSION,
    webSearch: webSearchEnabled(config),
    maxChunkTokens: config.maxChunkTokens,
    depth: config.analysisDepth,
  };
}

/** Vrai si l'entrée a été produite avec ces réglages. Une entrée antérieure à A1 n'est jamais conforme. */
export function sameSettings(entry: Partial<AnalysisSettings>, current: AnalysisSettings): boolean {
  return (Object.keys(current) as (keyof AnalysisSettings)[]).every((k) => entry[k] === current[k]);
}
