// Découpage des articles longs par paragraphes et fusion des résultats (décision D6).

import type { Analysis } from "./schema";

/** Estimation grossière, suffisante pour dimensionner les morceaux. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Regroupe les paragraphes en morceaux de `maxTokens` au plus. Un paragraphe
 * plus long que la limite forme un morceau à lui seul.
 */
export function chunkParagraphs(paragraphs: string[], maxTokens: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const p of paragraphs) {
    const t = estimateTokens(p);
    if (current.length > 0 && size + t > maxTokens) {
      chunks.push(current.join("\n\n"));
      current = [];
      size = 0;
    }
    current.push(p);
    size += t;
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks;
}

/**
 * Fusionne les analyses partielles : ids renumérotés, doublons de citation retirés.
 * Les résumés partiels sont concaténés ; une consolidation par un appel dédié
 * reste à faire (voir docs/fonctionnelles/points-ouverts.md).
 */
export function mergeAnalyses(parts: Analysis[]): Analysis {
  if (parts.length === 1) return renumber(parts[0]!);
  const seen = new Set<string>();
  const annotations = parts
    .flatMap((p) => p.annotations)
    .filter((a) => {
      const key = a.exact_quote.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const clickbait_gap = parts.map((p) => p.clickbait_gap?.trim()).find((s) => Boolean(s)) ?? "";
  const blind_spots = parts.map((p) => p.blind_spot?.trim()).filter((s): s is string => Boolean(s));
  const blind_spot = Array.from(new Set(blind_spots)).join("\n\n");
  return renumber({
    summary: parts.map((p) => p.summary.trim()).filter(Boolean).join("\n\n"),
    clickbait_gap,
    blind_spot,
    annotations,
  });
}

function renumber(a: Analysis): Analysis {
  return { ...a, annotations: a.annotations.map((ann, i) => ({ ...ann, id: `ann-${i + 1}` })) };
}

/** Exécute `fn` sur chaque élément avec au plus `limit` appels simultanés, en conservant l'ordre. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
