// Notation d'une analyse au regard d'une fiche du corpus (piste Q1, règles dans
// eval/corpus/README.md). Fonctions pures, testées par test/eval-score.test.ts et
// utilisées par scripts/corpus-eval.mjs.

import { quotesOverlap } from "../src/chunking";
import { isDocumentLevel, type Analysis, type Annotation } from "../src/schema";
import { CATEGORIES, type Category } from "../src/taxonomy";
import { normalize } from "../src/text-match";

export type Presence = "present" | "absent" | "any";

export interface ExpectedAnnotation {
  quote: string;
  /** "categorie/label" acceptés. */
  accept: string[];
  required: boolean;
  fact_status?: string[];
  note?: string;
}

export interface CorpusArticle {
  id: string;
  title: string;
  lang: string;
  kind: string;
  pair?: string;
  orientation?: string;
  control?: boolean;
  source?: { url?: string; author?: string; publisher?: string; published?: string };
  license: { name: string; redistributable: boolean };
  text_sha256?: string;
  eval?: { max_chunk_tokens?: number };
  document: { clickbait_gap: Presence; blind_spot: Presence };
  limits?: { max_rhetorical?: number };
  expected: ExpectedAnnotation[];
  not_expected?: { quote: string; note?: string }[];
}

export interface CategoryScore {
  /** Annotations `required` de la catégorie. */
  required: number;
  /** Retrouvées avec un label accepté. */
  found: number;
}

export interface Issue {
  kind: "missed" | "mislabeled" | "false_positive" | "not_expected" | "fact_status" | "unlocated" | "document" | "limit" | "overall";
  message: string;
}

export interface ArticleScore {
  id: string;
  /** Annotations de passage produites ; les annotations d'ensemble (B3) sont comptées à part. */
  produced: number;
  /** Annotations d'ensemble (B3), sans citation : listées pour relecture, hors précision. */
  overall: number;
  /** Annotations produites qui correspondent à une annotation attendue (requise ou tolérée). */
  matched: number;
  rhetorical: number;
  located: number;
  byCategory: Record<Category, CategoryScore>;
  /** Index des annotations `required` retrouvées (pour la stabilité entre exécutions). */
  foundRequired: number[];
  factChecked: number;
  factCorrect: number;
  documentChecks: number;
  documentCorrect: number;
  issues: Issue[];
}

function categoryOf(ref: string): Category {
  return ref.split("/")[0] as Category;
}

function accepts(e: ExpectedAnnotation, a: Annotation): boolean {
  return e.accept.includes(`${a.category}/${a.label}`);
}

function short(s: string, n = 70): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function scoreArticle(article: CorpusArticle, analysis: Analysis, text: string): ArticleScore {
  const hay = normalize(text);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { required: 0, found: 0 }])) as Record<Category, CategoryScore>;
  const issues: Issue[] = [];
  const foundRequired: number[] = [];
  let factChecked = 0;
  let factCorrect = 0;

  // Rappel : chaque annotation requise doit être retrouvée avec un label accepté.
  article.expected.forEach((e, i) => {
    const overlapping = analysis.annotations.filter((a) => quotesOverlap(a.exact_quote, e.quote));
    const hit = overlapping.find((a) => accepts(e, a));
    if (e.required) {
      const score = byCategory[categoryOf(e.accept[0]!)];
      score.required++;
      if (hit) {
        score.found++;
        foundRequired.push(i);
      } else if (overlapping.length > 0) {
        const got = overlapping.map((a) => `${a.category}/${a.label}`).join(", ");
        issues.push({ kind: "mislabeled", message: `« ${short(e.quote)} » : ${got}, attendu ${e.accept.join(" | ")}` });
      } else {
        issues.push({ kind: "missed", message: `« ${short(e.quote)} » (${e.accept[0]})` });
      }
    }
    // Statut factuel : jugé sur l'allégation produite qui recouvre la citation attendue.
    const claim = overlapping.find((a) => a.category === "factual_claim");
    if (e.fact_status && claim) {
      factChecked++;
      if (e.fact_status.includes(claim.fact_check.status)) factCorrect++;
      else issues.push({ kind: "fact_status", message: `« ${short(e.quote)} » : ${claim.fact_check.status}, attendu ${e.fact_status.join(" | ")}` });
    }
  });

  // Précision : une annotation qui ne recouvre aucune annotation attendue est un faux positif probable.
  let matched = 0;
  let located = 0;
  const passages = analysis.annotations.filter((a) => !isDocumentLevel(a));
  const overall = analysis.annotations.filter(isDocumentLevel);
  for (const a of overall) issues.push({ kind: "overall", message: `${a.category}/${a.label} (${a.severity}) : ${short(a.rhetoric_critique)}` });
  for (const a of passages) {
    if (hay.includes(normalize(a.exact_quote))) located++;
    else issues.push({ kind: "unlocated", message: `« ${short(a.exact_quote)} »` });
    const bad = article.not_expected?.find((n) => quotesOverlap(a.exact_quote, n.quote));
    if (bad) {
      issues.push({ kind: "not_expected", message: `${a.category}/${a.label} sur « ${short(bad.quote)} »` });
      continue;
    }
    if (article.expected.some((e) => quotesOverlap(a.exact_quote, e.quote))) matched++;
    else issues.push({ kind: "false_positive", message: `${a.category}/${a.label} (${a.severity}) « ${short(a.exact_quote)} »` });
  }

  // Éléments globaux de l'article.
  let documentChecks = 0;
  let documentCorrect = 0;
  const checkPresence = (name: string, expected: Presence, value: string | undefined) => {
    if (expected === "any") return;
    documentChecks++;
    const present = Boolean(value?.trim());
    if (present === (expected === "present")) documentCorrect++;
    else issues.push({ kind: "document", message: `${name} : ${present ? "produit" : "absent"}, attendu ${expected}` });
  };
  checkPresence("clickbait_gap", article.document.clickbait_gap, analysis.clickbait_gap);
  checkPresence("blind_spot", article.document.blind_spot, analysis.blind_spot);

  const rhetorical = analysis.annotations.filter((a) => a.category !== "factual_claim").length;
  const max = article.limits?.max_rhetorical;
  if (max !== undefined && rhetorical > max) {
    issues.push({ kind: "limit", message: `${rhetorical} annotations rhétoriques, ${max} au plus` });
  }

  return {
    id: article.id,
    produced: passages.length,
    overall: overall.length,
    matched,
    rhetorical,
    located,
    byCategory,
    foundRequired,
    factChecked,
    factCorrect,
    documentChecks,
    documentCorrect,
    issues,
  };
}

/**
 * Stabilité d'un article sur plusieurs exécutions : part des annotations requises
 * dont le résultat (retrouvée ou non) est le même à chaque exécution.
 */
export function stability(runs: ArticleScore[]): number | null {
  if (runs.length < 2) return null;
  const required = runs[0]!.byCategory;
  const total = CATEGORIES.reduce((n, c) => n + required[c].required, 0);
  if (total === 0) return null;
  const sets = runs.map((r) => new Set(r.foundRequired));
  const all = new Set(runs.flatMap((r) => r.foundRequired));
  const unstable = [...all].filter((i) => !sets.every((s) => s.has(i))).length;
  return (total - unstable) / total;
}

export interface Summary {
  articles: number;
  runs: number;
  byCategory: Record<Category, CategoryScore>;
  produced: number;
  /** Annotations d'ensemble (B3). */
  overall: number;
  matched: number;
  located: number;
  factChecked: number;
  factCorrect: number;
  documentChecks: number;
  documentCorrect: number;
  /** Annotations rhétoriques sur les articles témoins, en moyenne par exécution. */
  controlRhetorical: number;
}

export function summarize(scores: ArticleScore[], articles: CorpusArticle[]): Summary {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { required: 0, found: 0 }])) as Record<Category, CategoryScore>;
  const sum = (f: (s: ArticleScore) => number) => scores.reduce((n, s) => n + f(s), 0);
  for (const s of scores) {
    for (const c of CATEGORIES) {
      byCategory[c].required += s.byCategory[c].required;
      byCategory[c].found += s.byCategory[c].found;
    }
  }
  const controls = scores.filter((s) => byId.get(s.id)?.control);
  return {
    articles: new Set(scores.map((s) => s.id)).size,
    runs: scores.length,
    byCategory,
    produced: sum((s) => s.produced),
    overall: sum((s) => s.overall ?? 0),
    matched: sum((s) => s.matched),
    located: sum((s) => s.located),
    factChecked: sum((s) => s.factChecked),
    factCorrect: sum((s) => s.factCorrect),
    documentChecks: sum((s) => s.documentChecks),
    documentCorrect: sum((s) => s.documentCorrect),
    controlRhetorical: controls.length ? controls.reduce((n, s) => n + s.rhetorical, 0) / controls.length : 0,
  };
}
