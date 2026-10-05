// Notice Crossref des études citées (D16) : existence du DOI, revue, année, type de
// publication (prépublication), rétractation et avis de réserve. Crossref intègre la
// base Retraction Watch. API publique sans clé ; seul le DOI lui est envoyé.

import { mapSettled } from "./chunking";
import type { Annotation, StudyRecord } from "./schema";

export const CROSSREF_API = "https://api.crossref.org/works/";
/** Origine à demander en permission d'hôte quand elle n'est pas déjà accordée (mobile). */
export const CROSSREF_ORIGIN = "https://api.crossref.org/*";
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 2;

interface CrossrefUpdate {
  type?: string;
}

interface CrossrefWork {
  DOI?: string;
  type?: string;
  subtype?: string;
  title?: string[];
  "container-title"?: string[];
  institution?: { name?: string }[];
  issued?: { "date-parts"?: (number | null)[][] };
  published?: { "date-parts"?: (number | null)[][] };
  "updated-by"?: CrossrefUpdate[];
}

/** Notice lue dans la réponse `GET /works/{doi}` de Crossref. */
export function parseCrossrefWork(doi: string, message: CrossrefWork): StudyRecord {
  const title = message.title?.[0]?.trim();
  const year = message.issued?.["date-parts"]?.[0]?.[0] ?? message.published?.["date-parts"]?.[0]?.[0] ?? undefined;
  const updates = (message["updated-by"] ?? []).map((u) => (u.type ?? "").toLowerCase());
  const journal = message["container-title"]?.[0]?.trim() || message.institution?.[0]?.name?.trim();
  return {
    doi: message.DOI ?? doi,
    ...(title ? { title } : {}),
    ...(journal ? { journal } : {}),
    ...(typeof year === "number" ? { year } : {}),
    ...(message.type ? { type: message.type } : {}),
    preprint: message.type === "posted-content" || message.subtype === "preprint",
    retracted: updates.some((u) => /retraction|withdrawal|removal/.test(u)) || /^retracted\b/i.test(title ?? ""),
    concern: updates.some((u) => /concern/.test(u)),
  };
}

/** Notice du DOI, ou null s'il est inconnu de Crossref. Une erreur réseau lève une exception. */
export async function lookupDoi(doi: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<StudyRecord | null> {
  const res = await fetchImpl(`${CROSSREF_API}${encodeURIComponent(doi)}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    headers: { accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref : ${res.status}`);
  const body = (await res.json()) as { message?: CrossrefWork };
  return body.message ? parseCrossrefWork(doi, body.message) : null;
}

/**
 * Joint la notice Crossref aux allégations qui citent un DOI. Un DOI inconnu de
 * Crossref est retiré ; en cas d'erreur réseau, l'annotation reste inchangée.
 */
export async function attachStudyRecords(
  annotations: Annotation[],
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Annotation[]> {
  const dois = [...new Set(annotations.map((a) => a.fact_check.evidence?.doi).filter((d): d is string => Boolean(d)))];
  if (dois.length === 0) return annotations;
  const settled = await mapSettled(dois, CONCURRENCY, (doi) => lookupDoi(doi, signal, fetchImpl), signal);
  const records = new Map<string, StudyRecord | null>();
  settled.forEach((r, i) => {
    if (r.ok) records.set(dois[i]!, r.value);
    else if (!signal.aborted) console.warn("Rhetorix: notice Crossref indisponible :", r.error);
  });
  return annotations.map((a) => {
    const evidence = a.fact_check.evidence;
    if (!evidence?.doi || !records.has(evidence.doi)) return a;
    const record = records.get(evidence.doi);
    const updated = record ? { ...evidence, record } : { kind: evidence.kind };
    return { ...a, fact_check: { ...a.fact_check, evidence: updated } };
  });
}

/** Lien vers l'étude, à n'afficher que pour un DOI confirmé par Crossref (D16). */
export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}
