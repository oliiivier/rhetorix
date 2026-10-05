// Découpage des articles longs par paragraphes et fusion des résultats (décision D6).

import { SEVERITIES, type Analysis, type Annotation } from "./schema";
import { cleanBoundary, normalize } from "./text-match";

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
 * Texte soumis à la cartographie (B1) : l'article entier s'il tient dans `maxTokens`,
 * sinon ses premiers paragraphes (deux tiers du budget) et ses derniers (un tiers),
 * séparés par « […] ». Thèse et conclusion se trouvent en général à ces endroits.
 */
export function outlineSource(paragraphs: string[], maxTokens: number): { text: string; truncated: boolean } {
  const total = paragraphs.reduce((n, p) => n + estimateTokens(p), 0);
  if (total <= maxTokens) return { text: paragraphs.join("\n\n"), truncated: false };
  const head: string[] = [];
  let size = 0;
  let i = 0;
  for (; i < paragraphs.length; i++) {
    const t = estimateTokens(paragraphs[i]!);
    if (head.length > 0 && size + t > (maxTokens * 2) / 3) break;
    head.push(paragraphs[i]!);
    size += t;
  }
  const tail: string[] = [];
  for (let j = paragraphs.length - 1; j > i; j--) {
    const t = estimateTokens(paragraphs[j]!);
    if (size + t > maxTokens) break;
    tail.unshift(paragraphs[j]!);
    size += t;
  }
  return { text: [...head, "[…]", ...tail].join("\n\n"), truncated: true };
}

/**
 * Fusionne les analyses partielles : ids renumérotés, doublons retirés
 * (`dedupeAnnotations`). Les résumés partiels sont concaténés ; ils sont
 * normalement remplacés par l'appel de consolidation (analyze.ts).
 */
export function mergeAnalyses(parts: Analysis[]): Analysis {
  if (parts.length === 1) return renumber({ ...parts[0]!, annotations: dedupeAnnotations(parts[0]!.annotations) });
  const clickbait_gap = parts.map((p) => p.clickbait_gap?.trim()).find((s) => Boolean(s)) ?? "";
  const blind_spots = parts.map((p) => p.blind_spot?.trim()).filter((s): s is string => Boolean(s));
  const blind_spot = Array.from(new Set(blind_spots)).join("\n\n");
  return renumber({
    summary: parts.map((p) => p.summary.trim()).filter(Boolean).join("\n\n"),
    clickbait_gap,
    blind_spot,
    annotations: dedupeAnnotations(parts.flatMap((p) => p.annotations)),
  });
}

/** Part minimale du plus court des deux passages commune à l'autre pour qu'ils soient jugés redondants (A5). */
const OVERLAP_RATIO = 0.6;

/**
 * Vrai si deux citations désignent largement le même passage : l'une contient
 * l'autre, ou la fin de l'une recouvre le début de l'autre sur au moins
 * OVERLAP_RATIO de la plus courte. La comparaison ignore la casse, la typographie
 * et la ponctuation de bord (normalisation de la localisation).
 */
export function quotesOverlap(a: string, b: string): boolean {
  const x = normalize(cleanBoundary(a));
  const y = normalize(cleanBoundary(b));
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (long.includes(short)) return true;
  const min = Math.ceil(short.length * OVERLAP_RATIO);
  for (let k = short.length - 1; k >= min; k--) {
    if (long.endsWith(short.slice(0, k)) || long.startsWith(short.slice(short.length - k))) return true;
  }
  return false;
}

const severityRank = (a: Annotation) => SEVERITIES.length - SEVERITIES.indexOf(a.severity);

/**
 * Retire les doublons, dans l'ordre d'arrivée : citation identique (quelle que soit
 * la catégorie), ou citations de même catégorie qui se recouvrent largement (A5).
 * Entre deux annotations redondantes, la plus sévère est gardée, à sa place.
 */
export function dedupeAnnotations(annotations: Annotation[]): Annotation[] {
  const kept: Annotation[] = [];
  for (const a of annotations) {
    const quote = normalize(a.exact_quote);
    const i = kept.findIndex(
      (k) => normalize(k.exact_quote) === quote || (k.category === a.category && quotesOverlap(k.exact_quote, a.exact_quote)),
    );
    if (i < 0) kept.push(a);
    else if (severityRank(a) > severityRank(kept[i]!)) kept[i] = a;
  }
  return kept;
}

export function renumber(a: Analysis): Analysis {
  return { ...a, annotations: a.annotations.map((ann, i) => ({ ...ann, id: `ann-${i + 1}` })) };
}

export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Exécute `fn` sur chaque élément avec au plus `limit` appels simultanés, en conservant
 * l'ordre. Un échec n'interrompt pas les autres éléments (A3). Après une annulation
 * de `signal`, aucun nouvel élément n'est lancé : les éléments restants sont en échec.
 */
export async function mapSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<Settled<R>[]> {
  const results = new Array<Settled<R>>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      if (signal?.aborted) {
        results[i] = { ok: false, error: signal.reason };
        continue;
      }
      try {
        results[i] = { ok: true, value: await fn(items[i]!, i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
