// Contrat de sortie du LLM (spec §3) : types, JSON Schema envoyé aux providers,
// et validation côté client.

import { CATEGORIES, LABELS, isLabelOf, type Category } from "./taxonomy";

export const SEVERITIES = ["high", "medium", "low"] as const;
export const FACT_STATUSES = ["refuted", "supported", "misleading", "unverified"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type FactStatus = (typeof FACT_STATUSES)[number];

export interface Source {
  title: string;
  url: string;
}

export interface Annotation {
  id: string;
  exact_quote: string;
  category: Category;
  label: string;
  severity: Severity;
  rhetoric_critique: string;
  fact_check: {
    status: FactStatus;
    context: string;
    sources: Source[];
  };
}

export interface Analysis {
  summary: string;
  annotations: Annotation[];
}

const allLabels = [...new Set(CATEGORIES.flatMap((c) => Object.keys(LABELS[c])))];

/** JSON Schema compatible avec les modes stricts (additionalProperties: false, tout requis). */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "annotations"],
  properties: {
    summary: { type: "string" },
    annotations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "exact_quote", "category", "label", "severity", "rhetoric_critique", "fact_check"],
        properties: {
          id: { type: "string" },
          exact_quote: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          label: { type: "string", enum: allLabels },
          severity: { type: "string", enum: [...SEVERITIES] },
          rhetoric_critique: { type: "string" },
          fact_check: {
            type: "object",
            additionalProperties: false,
            required: ["status", "context", "sources"],
            properties: {
              status: { type: "string", enum: [...FACT_STATUSES] },
              context: { type: "string" },
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

/**
 * Valide la sortie brute du LLM. Les erreurs de structure lèvent une SchemaError ;
 * les défauts récupérables sont corrigés : label hors catégorie → "autre",
 * URL non http(s) retirée.
 */
export function validateAnalysis(raw: unknown): Analysis {
  const root = obj(raw, "$");
  const summary = str(root.summary, "$.summary");
  const annotations = arr(root.annotations, "$.annotations").map((a, i): Annotation => {
    const p = `$.annotations[${i}]`;
    const o = obj(a, p);
    const category = oneOf(o.category, CATEGORIES, `${p}.category`);
    const rawLabel = str(o.label, `${p}.label`);
    const fc = obj(o.fact_check, `${p}.fact_check`);
    const exact_quote = str(o.exact_quote, `${p}.exact_quote`).trim();
    if (!exact_quote) fail(`${p}.exact_quote`, "citation vide");
    return {
      id: str(o.id, `${p}.id`),
      exact_quote,
      category,
      label: isLabelOf(category, rawLabel) ? rawLabel : "autre",
      severity: oneOf(o.severity, SEVERITIES, `${p}.severity`),
      rhetoric_critique: str(o.rhetoric_critique, `${p}.rhetoric_critique`),
      fact_check: {
        status: oneOf(fc.status, FACT_STATUSES, `${p}.fact_check.status`),
        context: str(fc.context, `${p}.fact_check.context`),
        sources: arr(fc.sources, `${p}.fact_check.sources`)
          .map((s, j) => {
            const so = obj(s, `${p}.fact_check.sources[${j}]`);
            return { title: str(so.title, `${p}.fact_check.sources[${j}].title`), url: str(so.url, `${p}.fact_check.sources[${j}].url`) };
          })
          .filter((s) => isHttpUrl(s.url)),
      },
    };
  });
  return { summary, annotations };
}

/**
 * Décision D3 : seules les URL effectivement renvoyées par l'outil de recherche web
 * du provider sont conservées. `searchedUrls` absent = pas de recherche web :
 * toutes les sources sont retirées et le statut passe à "unverified".
 */
export function enforceSourcePolicy(analysis: Analysis, searchedUrls: ReadonlySet<string> | undefined): Analysis {
  return {
    ...analysis,
    annotations: analysis.annotations.map((a) => {
      if (!searchedUrls) {
        return { ...a, fact_check: { ...a.fact_check, status: "unverified", sources: [] } };
      }
      const sources = a.fact_check.sources.filter((s) => searchedUrls.has(normalizeSourceUrl(s.url)));
      const status = sources.length === 0 && a.fact_check.status !== "unverified" ? "unverified" : a.fact_check.status;
      return { ...a, fact_check: { ...a.fact_check, status, sources } };
    }),
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
