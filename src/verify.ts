// Vérification d'une allégation à la demande (C2) : un appel au provider avec la
// recherche web activée pour ce seul appel, puis politique des sources (D3).

import { resolveLanguage, type Config } from "./config";
import { verifyPrompt, type ArticleMeta } from "./prompt";
import { PROVIDERS } from "./providers";
import { ProviderError } from "./providers/types";
import { enforceFactCheckSourcePolicy, normalizeSourceUrl, validateFactCheck, type Annotation, type FactCheck } from "./schema";
import { parseJsonObject } from "./streaming-json";
import type { TokenUsage } from "./tokens";

/** Vrai si le provider configuré permet la vérification à la demande. */
export function canVerifyOnDemand(config: Config): boolean {
  return PROVIDERS[config.provider].searchesOnDemand(config);
}

export interface VerifyContext {
  title: string;
  /** Paragraphe qui contient l'allégation, s'il est connu. */
  paragraph?: string;
  meta?: ArticleMeta;
}

/**
 * Vérifie l'allégation et renvoie le nouveau `fact_check`. Une réponse illisible lève
 * une erreur ; les sources qui ne viennent pas de la recherche sont retirées (D3).
 */
export async function verifyAnnotation(
  annotation: Annotation,
  ctx: VerifyContext,
  config: Config,
  signal: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
): Promise<FactCheck> {
  const searched = new Set<string>();
  const prompt = verifyPrompt(
    {
      title: ctx.title,
      quote: annotation.exact_quote,
      context: ctx.paragraph,
      critique: annotation.rhetoric_critique,
      meta: ctx.meta,
      analysisDate: new Date().toISOString().slice(0, 10),
    },
    resolveLanguage(config),
  );
  const text = await PROVIDERS[config.provider].complete({ ...prompt, json: true, webSearch: true, maxTokens: 2000 }, config, signal, {
    onSource: (url) => searched.add(normalizeSourceUrl(url)),
    onUsage,
  });
  const out = parseJsonObject(text);
  if (!out) throw new ProviderError("La réponse n'est pas un JSON valide.", "invalid_json");
  return enforceFactCheckSourcePolicy(validateFactCheck(out), searched);
}
