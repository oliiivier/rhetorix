// Annotations contestées par l'utilisateur (Q4) : enregistrées dans storage.local,
// retrouvées dans les options, d'où l'utilisateur peut ouvrir un ticket GitHub
// prérempli. Rien n'est envoyé sans son action : le ticket s'ouvre dans un onglet et
// c'est lui qui le publie.

import { ext } from "./ext";
import type { Annotation } from "./schema";

export const CONTESTED_KEY = "contested";
export const MAX_CONTESTED = 200;
export const ISSUES_URL = "https://github.com/oliiivier/rhetorix/issues/new";
/** Au-delà, GitHub refuse l'URL ; le corps du ticket est raccourci en conséquence. */
const MAX_ISSUE_URL = 7500;

export type ContestedAnnotationData = Pick<
  Annotation,
  "exact_quote" | "category" | "label" | "severity" | "confidence" | "rhetoric_critique" | "fact_check"
>;

export interface ContestedAnnotation {
  /** Identité stable : page, catégorie, étiquette et citation (contestKey). */
  key: string;
  url: string;
  pageTitle: string;
  contestedAt: number;
  /** Date d'ouverture du ticket GitHub, s'il a été ouvert. */
  reportedAt?: number;
  annotation: ContestedAnnotationData;
  /** Réglages du moteur qui ont produit l'annotation. */
  engine: { provider: string; model: string; engineVersion: number; depth: string; lang: string; webSearch: boolean };
}

/** URL de la page sans fragment. */
function pageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

export function contestKey(url: string, a: Pick<Annotation, "category" | "exact_quote"> & { label?: string }): string {
  return `${pageUrl(url)}\n${a.category}/${a.label ?? ""}\n${a.exact_quote}`;
}

export async function loadContested(): Promise<ContestedAnnotation[]> {
  try {
    const stored = (await ext.storage.local.get(CONTESTED_KEY))[CONTESTED_KEY];
    return Array.isArray(stored) ? (stored as ContestedAnnotation[]) : [];
  } catch {
    return [];
  }
}

async function save(list: ContestedAnnotation[]): Promise<void> {
  await ext.storage.local.set({ [CONTESTED_KEY]: list.slice(-MAX_CONTESTED) });
}

/** Ajoute l'annotation à la liste, ou la remplace si elle y est déjà. */
export async function addContested(entry: ContestedAnnotation): Promise<void> {
  const list = (await loadContested()).filter((e) => e.key !== entry.key);
  list.push(entry);
  await save(list);
}

export async function removeContested(key: string): Promise<void> {
  await save((await loadContested()).filter((e) => e.key !== key));
}

export async function markReported(key: string, at = Date.now()): Promise<void> {
  await save((await loadContested()).map((e) => (e.key === key ? { ...e, reportedAt: at } : e)));
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

/** Bloc de citation Markdown. */
function quoteBlock(s: string): string {
  return s
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

export interface IssueOptions {
  /** Inclure l'adresse de la page (décochable pour une page privée ou interne). */
  includeUrl: boolean;
  /** Commentaire de l'utilisateur. */
  comment?: string;
  extensionVersion?: string;
}

function issueBody(e: ContestedAnnotation, opts: IssueOptions, maxText: number): string {
  const a = e.annotation;
  const fc = a.fact_check;
  const lines = [
    "Annotation signalée comme contestable depuis l'extension.",
    "",
    `**Page** : ${clip(e.pageTitle, 200) || "(sans titre)"}${opts.includeUrl ? `\n${e.url}` : " (adresse non communiquée)"}`,
    "",
    `**Annotation** : ${a.category}/${a.label}, sévérité ${a.severity}${a.confidence ? `, confiance ${a.confidence}` : ""}`,
    "",
    a.exact_quote ? `**Citation**\n\n${quoteBlock(clip(a.exact_quote, maxText))}` : "**Citation** : aucune (annotation sur l'ensemble de l'article)",
    "",
    `**Critique**\n\n${quoteBlock(clip(a.rhetoric_critique, maxText))}`,
  ];
  if (a.category === "factual_claim" || fc.context) {
    lines.push("", `**Vérification** : ${fc.status}`);
    if (fc.context) lines.push("", quoteBlock(clip(fc.context, maxText)));
    for (const s of fc.sources) lines.push(`- ${s.url}`);
  }
  if (opts.comment?.trim()) lines.push("", `**Commentaire**\n\n${clip(opts.comment.trim(), maxText * 2)}`);
  const eng = e.engine;
  lines.push(
    "",
    `**Moteur** : ${eng.provider} / ${eng.model}, version ${eng.engineVersion}, analyse ${eng.depth}, langue ${eng.lang}, recherche web ${eng.webSearch ? "oui" : "non"}${opts.extensionVersion ? `, extension ${opts.extensionVersion}` : ""}`,
  );
  return lines.join("\n");
}

/** URL de création d'un ticket GitHub prérempli. */
export function issueUrl(e: ContestedAnnotation, opts: IssueOptions): string {
  const title = `Annotation contestable : ${e.annotation.category}/${e.annotation.label}`;
  let url = "";
  for (const maxText of [1500, 800, 400, 200, 100]) {
    const params = new URLSearchParams({ title, body: issueBody(e, opts, maxText) });
    url = `${ISSUES_URL}?${params.toString()}`;
    if (url.length <= MAX_ISSUE_URL) break;
  }
  return url;
}
