// Contrat de sortie du LLM (spec §3) : types, JSON Schema envoyé aux providers,
// et validation côté client.

import { CATEGORIES, LABELS, isLabelOf, type Category } from "./taxonomy";

export const SEVERITIES = ["high", "medium", "low"] as const;
export const FACT_STATUSES = ["refuted", "supported", "misleading", "unverified"] as const;
export const CONFIDENCES = ["high", "medium", "low"] as const;
/**
 * Niveau de preuve d'une allégation scientifique (D16). Le schéma envoyé au LLM y ajoute
 * "none" (allégation non scientifique), retiré à la validation.
 */
export const EVIDENCE_KINDS = ["meta_analysis", "rct", "observational", "animal_in_vitro", "preprint", "unknown"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type FactStatus = (typeof FACT_STATUSES)[number];
/** Confiance du modèle dans l'annotation : le procédé est-il bien présent et l'étiquette juste ? (Q3) */
export type Confidence = (typeof CONFIDENCES)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface Source {
  title: string;
  url: string;
}

/** Notice Crossref d'une étude dont le DOI a été confirmé (D16). Ajoutée par le client, hors contrat du LLM. */
export interface StudyRecord {
  doi: string;
  title?: string;
  journal?: string;
  year?: number;
  /** Type Crossref (journal-article, posted-content…). */
  type?: string;
  preprint: boolean;
  retracted: boolean;
  /** Avis de réserve (expression of concern) publié par l'éditeur. */
  concern: boolean;
  /** Financeurs déclarés dans Crossref (D17). */
  funders?: string[];
  /** Déclarations d'intérêts publiées avec l'étude, telles quelles (D17). */
  disclosures?: Disclosure[];
}

/** Déclaration d'intérêts des auteurs, reprise d'une source structurée, jamais du modèle (D17). */
export interface Disclosure {
  source: "crossref" | "pubmed";
  text: string;
}

/** Étude sur laquelle repose une allégation scientifique (D16). */
export interface Evidence {
  kind: EvidenceKind;
  /** DOI donné par le modèle ; retiré sans recherche web ou s'il est inconnu de Crossref. */
  doi?: string;
  record?: StudyRecord;
}

export interface FactCheck {
  status: FactStatus;
  context: string;
  sources: Source[];
  /** Absente pour une allégation non scientifique et dans les analyses antérieures à D16. */
  evidence?: Evidence;
}

export interface Annotation {
  id: string;
  /**
   * Citation exacte du passage. Vide pour une annotation d'ensemble (B3, D12) : défaut
   * de structure de l'argumentation, sans passage précis, ancré sur le titre.
   */
  exact_quote: string;
  category: Category;
  label: string;
  severity: Severity;
  /** Absente des analyses antérieures à Q3. */
  confidence?: Confidence;
  rhetoric_critique: string;
  fact_check: FactCheck;
}

/** Vrai si l'allégation peut faire l'objet d'une vérification en ligne à la demande (C2). */
export function isVerifiable(a: Pick<Annotation, "category" | "exact_quote" | "fact_check">): boolean {
  return a.category === "factual_claim" && a.exact_quote !== "" && a.fact_check.status === "unverified";
}

/** Annotation d'ensemble (B3) : elle ne cite aucun passage et s'ancre sur le titre. */
export function isDocumentLevel(a: Pick<Annotation, "exact_quote">): boolean {
  return a.exact_quote === "";
}

export interface Analysis {
  summary: string;
  clickbait_gap?: string;
  blind_spot?: string;
  annotations: Annotation[];
}

const allLabels = [...new Set(CATEGORIES.flatMap((c) => Object.keys(LABELS[c])))];

/** JSON Schema compatible avec les modes stricts (additionalProperties: false, tout requis). */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "clickbait_gap", "blind_spot", "annotations"],
  properties: {
    summary: { type: "string" },
    clickbait_gap: { type: "string" },
    blind_spot: { type: "string" },
    annotations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "exact_quote", "category", "label", "severity", "confidence", "rhetoric_critique", "fact_check"],
        properties: {
          id: { type: "string" },
          exact_quote: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          label: { type: "string", enum: allLabels },
          severity: { type: "string", enum: [...SEVERITIES] },
          confidence: { type: "string", enum: [...CONFIDENCES] },
          rhetoric_critique: { type: "string" },
          fact_check: {
            type: "object",
            additionalProperties: false,
            required: ["status", "context", "sources", "evidence"],
            properties: {
              status: { type: "string", enum: [...FACT_STATUSES] },
              context: { type: "string" },
              evidence: {
                type: "object",
                additionalProperties: false,
                required: ["kind", "doi"],
                properties: {
                  kind: { type: "string", enum: [...EVIDENCE_KINDS, "none"] },
                  doi: { type: "string" },
                },
              },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "url"],
                  properties: { title: { type: "string" }, url: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export class SchemaError extends Error {}

function fail(path: string, msg: string): never {
  throw new SchemaError(`${path} : ${msg}`);
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string") fail(path, "chaîne attendue");
  return v;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], path: string): T {
  if (typeof v !== "string" || !values.includes(v as T)) fail(path, `valeur hors énumération (${String(v)})`);
  return v as T;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "objet attendu");
  return v as Record<string, unknown>;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "tableau attendu");
  return v;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateAnnotation(a: unknown, path = "$.annotation"): Annotation {
  const o = obj(a, path);
  const category = oneOf(o.category, CATEGORIES, `${path}.category`);
  const rawLabel = str(o.label, `${path}.label`);
  const exact_quote = str(o.exact_quote, `${path}.exact_quote`).trim();
  // B3 : seule une annotation rhétorique peut porter sur l'ensemble ; une allégation
  // factuelle se vérifie sur un passage précis.
  if (!exact_quote && category === "factual_claim") fail(`${path}.exact_quote`, "citation vide");
  const confidence = CONFIDENCES.find((c) => c === o.confidence);
  return {
    id: str(o.id, `${path}.id`),
    exact_quote,
    category,
    label: isLabelOf(category, rawLabel) ? rawLabel : "autre",
    severity: oneOf(o.severity, SEVERITIES, `${path}.severity`),
    ...(confidence ? { confidence } : {}),
    rhetoric_critique: str(o.rhetoric_critique, `${path}.rhetoric_critique`),
    fact_check: validateFactCheck(o.fact_check, `${path}.fact_check`),
  };
}

export function validateFactCheck(v: unknown, path = "$.fact_check"): FactCheck {
  const fc = obj(v, path);
  const evidence = validateEvidence(fc.evidence);
  return {
    status: oneOf(fc.status, FACT_STATUSES, `${path}.status`),
    context: str(fc.context, `${path}.context`),
    sources: arr(fc.sources, `${path}.sources`)
      .map((s, j) => {
        const so = obj(s, `${path}.sources[${j}]`);
        return { title: str(so.title, `${path}.sources[${j}].title`), url: str(so.url, `${path}.sources[${j}].url`) };
      })
      .filter((s) => isHttpUrl(s.url)),
    ...(evidence ? { evidence } : {}),
  };
}

/** DOI nu (10.xxxx/…), débarrassé d'un préfixe doi: ou https://doi.org/ ; undefined s'il est mal formé. */
export function normalizeDoi(raw: string): string | undefined {
  const doi = raw
    .trim()
    .replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "")
    .replace(/[.,;]+$/, "");
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : undefined;
}

/**
 * Niveau de preuve (D16), toléré : absent, "none" ou hors énumération → pas de
 * niveau de preuve ; DOI mal formé retiré.
 */
function validateEvidence(v: unknown): Evidence | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const kind = EVIDENCE_KINDS.find((k) => k === o.kind);
  if (!kind) return undefined;
  const doi = typeof o.doi === "string" ? normalizeDoi(o.doi) : undefined;
  return doi ? { kind, doi } : { kind };
}

/**
 * Valide la sortie brute du LLM. Les erreurs de structure lèvent une SchemaError ;
 * les défauts récupérables sont corrigés : label hors catégorie → "autre",
 * URL non http(s) retirée, confiance absente ou hors énumération omise.
 */
export function validateAnalysis(raw: unknown): Analysis {
  const root = obj(raw, "$");
  const summary = str(root.summary, "$.summary");
  const clickbait_gap = typeof root.clickbait_gap === "string" ? root.clickbait_gap.trim() : "";
  const blind_spot = typeof root.blind_spot === "string" ? root.blind_spot.trim() : "";
  const annotations = arr(root.annotations, "$.annotations").map((a, i): Annotation => {
    return validateAnnotation(a, `$.annotations[${i}]`);
  });
  return { summary, clickbait_gap, blind_spot, annotations };
}

export function enforceAnnotationSourcePolicy(
  a: Annotation,
  searchedUrls: ReadonlySet<string> | undefined,
): Annotation {
  return { ...a, fact_check: enforceFactCheckSourcePolicy(a.fact_check, searchedUrls) };
}

/** Politique des sources (D3) appliquée à une vérification seule. */
export function enforceFactCheckSourcePolicy(fc: FactCheck, searchedUrls: ReadonlySet<string> | undefined): FactCheck {
  if (!searchedUrls) {
    // Sans recherche, un DOI viendrait de la mémoire du modèle : il est retiré (D3, D16).
    const evidence = fc.evidence ? { kind: fc.evidence.kind } : undefined;
    return { ...fc, status: "unverified", sources: [], ...(evidence ? { evidence } : {}) };
  }
  const sources = fc.sources.filter((s) => searchedUrls.has(normalizeSourceUrl(s.url)));
  const status = sources.length === 0 && fc.status !== "unverified" ? "unverified" : fc.status;
  return { ...fc, status, sources };
}

/**
 * Décision D3 : seules les URL effectivement renvoyées par l'outil de recherche web
 * du provider sont conservées. `searchedUrls` absent = pas de recherche web :
 * toutes les sources sont retirées et le statut passe à "unverified".
 */
export function enforceSourcePolicy(analysis: Analysis, searchedUrls: ReadonlySet<string> | undefined): Analysis {
  return {
    ...analysis,
    annotations: analysis.annotations.map((a) => enforceAnnotationSourcePolicy(a, searchedUrls)),
  };
}

export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
