// Recherche des citations du LLM dans le texte de la page (architecture §4).
// Fonctions pures : le content script fournit le texte concaténé des nœuds Text
// et convertit les offsets renvoyés en Range DOM.

/** Remplacements à longueur constante, pour que les offsets restent alignés sur le texte source. */
const CHAR_MAP: Record<string, string> = {
  " ": " ", " ": " ", " ": " ", " ": " ", "\t": " ", "\n": " ", "\r": " ",
  "‘": "'", "’": "'", "ʼ": "'", "′": "'",
  "“": '"', "”": '"', "«": '"', "»": '"', "„": '"',
  "–": "-", "—": "-", "−": "-",
};

/**
 * Normalise un texte et renvoie, pour chaque caractère du résultat, son offset dans
 * l'original. Les espaces consécutifs sont fusionnés, la casse est ignorée.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = (CHAR_MAP[text[i]!] ?? text[i]!).toLowerCase();
    if (ch === " " || ch === "​") {
      if (lastWasSpace) continue;
      lastWasSpace = true;
      norm += " ";
      map.push(i);
      continue;
    }
    lastWasSpace = false;
    norm += ch;
    map.push(i);
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function normalize(text: string): string {
  return normalizeWithMap(text).norm;
}

export interface Match {
  start: number;
  end: number; // exclusif, offsets dans le texte source
  exact: boolean;
}

/** Nombre de caractères utilisés aux deux extrémités pour le repli approximatif. */
const ANCHOR_LEN = 24;

/**
 * Cherche `quote` dans `haystack` (déjà normalisé via normalizeWithMap).
 * 1. correspondance exacte après normalisation ;
 * 2. repli : début et fin de la citation retrouvés dans l'ordre, à une distance
 *    compatible avec la longueur de la citation (le LLM a pu altérer le milieu).
 */
export function findQuote(haystack: { norm: string; map: number[] }, quote: string, fromIndex = 0): Match | null {
  const q = normalize(quote).replace(/^["'\s]+|["'\s]+$/g, "");
  if (!q) return null;
  const { norm, map } = haystack;

  const idx = norm.indexOf(q, fromIndex);
  if (idx !== -1) return toMatch(map, idx, idx + q.length, true);

  if (q.length < ANCHOR_LEN * 2 + 8) return null;
  const head = q.slice(0, ANCHOR_LEN);
  const tail = q.slice(-ANCHOR_LEN);
  let h = norm.indexOf(head, fromIndex);
  while (h !== -1) {
    const minEnd = h + Math.floor(q.length * 0.7);
    const maxEnd = h + Math.ceil(q.length * 1.3);
    const t = norm.indexOf(tail, minEnd - ANCHOR_LEN);
    if (t !== -1 && t + ANCHOR_LEN <= maxEnd) return toMatch(map, h, t + ANCHOR_LEN, false);
    h = norm.indexOf(head, h + 1);
  }
  return null;
}

function toMatch(map: number[], normStart: number, normEnd: number, exact: boolean): Match {
  return { start: map[normStart]!, end: map[normEnd - 1]! + 1, exact };
}
