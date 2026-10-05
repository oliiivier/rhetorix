// Notice Crossref des études citées (D16) : existence du DOI, revue, année, type de
// publication (prépublication), rétractation et avis de réserve, ainsi que financeurs
// et déclarations d'intérêts déposés par l'éditeur (D17). Crossref intègre la base
// Retraction Watch. API publique sans clé ; seul le DOI lui est envoyé.

import type { StudyRecord } from "./schema";

export const CROSSREF_API = "https://api.crossref.org/works/";
/** Origine à demander en permission d'hôte quand elle n'est pas déjà accordée (mobile). */
export const CROSSREF_ORIGIN = "https://api.crossref.org/*";
const TIMEOUT_MS = 8_000;

interface CrossrefUpdate {
  type?: string;
}

/** Mention déposée par l'éditeur (licence, financement, déclaration d'intérêts…). */
interface CrossrefAssertion {
  name?: string;
  label?: string;
  value?: string;
  group?: { name?: string; label?: string };
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
  funder?: { name?: string }[];
  assertion?: CrossrefAssertion[];
}

/** Mention qui porte sur les conflits d'intérêts des auteurs. */
const COI_ASSERTION = /conflicts?[ _-]?of[ _-]?interest|competing[ _-]?interests?|declarations?[ _-]?of[ _-]?interests?|disclosure|\bcoi\b/i;

/** Texte d'une valeur Crossref, qui peut contenir du balisage JATS ou HTML. */
function plain(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Notice lue dans la réponse `GET /works/{doi}` de Crossref. */
export function parseCrossrefWork(doi: string, message: CrossrefWork): StudyRecord {
  const title = message.title?.[0]?.trim();
  const year = message.issued?.["date-parts"]?.[0]?.[0] ?? message.published?.["date-parts"]?.[0]?.[0] ?? undefined;
  const updates = (message["updated-by"] ?? []).map((u) => (u.type ?? "").toLowerCase());
  const journal = message["container-title"]?.[0]?.trim() || message.institution?.[0]?.name?.trim();
  const funders = [...new Set((message.funder ?? []).map((f) => f.name?.trim()).filter((n): n is string => Boolean(n)))];
  const disclosures = (message.assertion ?? [])
    .filter((a) => COI_ASSERTION.test([a.name, a.label, a.group?.name, a.group?.label].filter(Boolean).join(" ")))
    .map((a) => plain(a.value ?? ""))
    .filter(Boolean)
    .map((text) => ({ source: "crossref" as const, text }));
  return {
    doi: message.DOI ?? doi,
    ...(title ? { title } : {}),
    ...(journal ? { journal } : {}),
    ...(typeof year === "number" ? { year } : {}),
    ...(message.type ? { type: message.type } : {}),
    preprint: message.type === "posted-content" || message.subtype === "preprint",
    retracted: updates.some((u) => /retraction|withdrawal|removal/.test(u)) || /^retracted\b/i.test(title ?? ""),
    concern: updates.some((u) => /concern/.test(u)),
    ...(funders.length ? { funders } : {}),
    ...(disclosures.length ? { disclosures } : {}),
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

/** Lien vers l'étude, à n'afficher que pour un DOI confirmé par Crossref (D16). */
export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}
