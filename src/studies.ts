// Notice des études citées par les allégations scientifiques (D16, D17) : Crossref pour
// toute étude qui a un DOI, puis PubMed pour la déclaration d'intérêts des auteurs
// quand Crossref n'en a pas et que l'étude y est indexée (étude biomédicale).

import { mapSettled } from "./chunking";
import { lookupDoi } from "./crossref";
import { lookupPubmedCoi } from "./pubmed";
import type { Annotation, StudyRecord } from "./schema";

const CONCURRENCY = 2;

/** Notice Crossref, complétée si possible de la déclaration d'intérêts publiée dans PubMed. */
async function studyRecord(doi: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<StudyRecord | null> {
  const record = await lookupDoi(doi, signal, fetchImpl);
  if (!record || record.disclosures?.length || record.preprint) return record;
  try {
    const coi = await lookupPubmedCoi(doi, signal, fetchImpl);
    return coi ? { ...record, disclosures: [{ source: "pubmed", text: coi }] } : record;
  } catch (err) {
    if (!signal.aborted) console.warn("Rhetorix: notice PubMed indisponible :", err);
    return record;
  }
}

/**
 * Joint la notice de l'étude aux allégations qui citent un DOI. Un DOI inconnu de
 * Crossref est retiré ; en cas d'erreur réseau, l'annotation reste inchangée.
 */
export async function attachStudyRecords(
  annotations: Annotation[],
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Annotation[]> {
  const dois = [...new Set(annotations.map((a) => a.fact_check.evidence?.doi).filter((d): d is string => Boolean(d)))];
  if (dois.length === 0) return annotations;
  const settled = await mapSettled(dois, CONCURRENCY, (doi) => studyRecord(doi, signal, fetchImpl), signal);
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
