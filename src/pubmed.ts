// Déclaration d'intérêts des auteurs d'une étude biomédicale, d'après PubMed (D17) :
// API E-utilities de la NCBI, sans clé (3 requêtes par seconde au plus). Seul le DOI
// est envoyé. Le script de fond n'a pas de DOMParser : le XML est lu par expression
// régulière, sur le seul élément <CoiStatement>.

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
/** Origine à demander en permission d'hôte quand elle n'est pas déjà accordée (mobile). */
export const PUBMED_ORIGIN = "https://eutils.ncbi.nlm.nih.gov/*";
const TIMEOUT_MS = 8_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Texte d'un fragment XML : balises retirées, entités décodées, espaces normalisés. */
export function xmlText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Déclarations <CoiStatement> d'une réponse efetch. */
export function parseCoiStatements(xml: string): string[] {
  return [...xml.matchAll(/<CoiStatement\b[^>]*>([\s\S]*?)<\/CoiStatement>/g)].map((m) => xmlText(m[1]!)).filter(Boolean);
}

async function get(url: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<Response> {
  const res = await fetchImpl(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) });
  if (!res.ok) throw new Error(`PubMed : ${res.status}`);
  return res;
}

/**
 * Déclaration d'intérêts de l'étude, ou null si le DOI n'est pas indexé dans PubMed
 * (étude non biomédicale) ou si la notice n'en contient pas.
 */
export async function lookupPubmedCoi(doi: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const term = encodeURIComponent(`${doi}[doi]`);
  const search = (await (await get(`${EUTILS}esearch.fcgi?db=pubmed&retmode=json&tool=rhetorix&term=${term}`, signal, fetchImpl)).json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const ids = search.esearchresult?.idlist ?? [];
  // Un DOI qui renvoie plusieurs notices n'est pas une correspondance fiable.
  if (ids.length !== 1) return null;
  const xml = await (await get(`${EUTILS}efetch.fcgi?db=pubmed&retmode=xml&tool=rhetorix&id=${encodeURIComponent(ids[0]!)}`, signal, fetchImpl)).text();
  const statements = parseCoiStatements(xml);
  return statements.length ? statements.join(" ") : null;
}
