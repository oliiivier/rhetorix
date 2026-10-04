// Recherche des citations du LLM dans le texte de la page (architecture §4).
// Fonctions pures : le content script fournit le texte concaténé des nœuds Text
// et convertit les offsets renvoyés en Range DOM.

/** Remplacements à longueur constante, pour que les offsets restent alignés sur le texte source. */
const CHAR_MAP: Record<string, string> = {
  // Espaces variés
  "\u00A0": " ", // espace insécable
  "\u202F": " ", // espace insécable fin
  "\u2009": " ", // espace fin
  "\u2007": " ", // espace numérique
  "\u2002": " ", // demi-cadratin
  "\u2003": " ", // cadratin
  "\u2004": " ", // tiers de cadratin
  "\u2005": " ", // quart de cadratin
  "\u2006": " ", // sixième de cadratin
  "\u2008": " ", // espace de ponctuation
  "\u200A": " ", // espace ultrafin
  "\u3000": " ", // espace idéographique
  "\t": " ", "\n": " ", "\r": " ",

  // Apostrophes et accents
  "‘": "'", "’": "'", "ʼ": "'", "′": "'", "‛": "'", "`": "'", "´": "'",

  // Guillemets
  "“": '"', "”": '"', "«": '"', "»": '"', "„": '"', "‟": '"', "″": '"', "‹": '"', "›": '"',

  // Tirets et traits d'union
  "–": "-", "—": "-", "−": "-", "‐": "-", "‑": "-", "‒": "-", "―": "-",
};

const BOUNDARY_NOISE = /^[\s"'«»“”‘’„….\-–—\[\](){}*•,:;!?]+|[\s"'«»“”‘’„….\-–—\[\](){}*•,:;!?]+$/g;

export function cleanBoundary(text: string): string {
  let cleaned = text.trim();
  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(BOUNDARY_NOISE, "").trim();
  }
  return cleaned;
}

/**
 * Normalise un texte et renvoie, pour chaque caractère du résultat, son offset dans
 * l'original. Les espaces consécutifs sont fusionnés, la casse est ignorée.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const rawCh = text[i]!;
    // Ignorer les caractères invisibles
    if (rawCh === "\u200B" || rawCh === "\u00AD" || rawCh === "\uFEFF" || rawCh === "\u200C" || rawCh === "\u200D") {
      continue;
    }
    const ch = (CHAR_MAP[rawCh] ?? rawCh).toLowerCase();
    if (ch === " ") {
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

/** Nombre de caractères utilisés aux deux extrémités pour le repli caractère approximatif. */
const ANCHOR_LEN = 20;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toMatch(map: number[], normStart: number, normEnd: number, exact: boolean): Match {
  const start = map[normStart]!;
  const end = map[normEnd - 1]! + 1;
  return { start, end, exact };
}

function findMultiPart(norm: string, map: number[], parts: string[], fromIndex: number): Match | null {
  const first = parts[0]!;
  let p0 = norm.indexOf(first, fromIndex);
  while (p0 !== -1) {
    let curr = p0 + first.length;
    let ok = true;
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]!;
      const nextIdx = norm.indexOf(p, curr);
      // Les parties doivent se suivre dans un rayon raisonnable (< 800 caractères)
      if (nextIdx === -1 || nextIdx - curr > 800) {
        ok = false;
        break;
      }
      curr = nextIdx + p.length;
    }
    if (ok) {
      return toMatch(map, p0, curr, false);
    }
    p0 = norm.indexOf(first, p0 + 1);
  }
  return null;
}

function findPunctuationFlexible(norm: string, map: number[], words: string[], fromIndex: number): Match | null {
  if (words.length < 2 || words.length > 50) return null;
  try {
    const pattern = words.map(escapeRegExp).join("[\\s\\p{P}]+");
    const regex = new RegExp(pattern, "gui");
    regex.lastIndex = fromIndex;
    const match = regex.exec(norm);
    if (match && match.index >= fromIndex) {
      return toMatch(map, match.index, match.index + match[0].length, false);
    }
  } catch {
    // Si regex trop longue ou invalide, ignorer
  }
  return null;
}

function findWordAnchors(norm: string, map: number[], words: string[], fromIndex: number): Match | null {
  const totalWordChars = words.reduce((acc, w) => acc + w.length, 0);
  const anchorCount = words.length >= 8 ? 3 : 2;

  const headCandidates = [
    words.slice(0, anchorCount).join(" "),
    words.slice(1, anchorCount + 1).join(" "),
  ].filter(Boolean);

  const tailCandidates = [
    words.slice(-anchorCount).join(" "),
    words.slice(-anchorCount - 1, -1).join(" "),
  ].filter(Boolean);

  for (const head of headCandidates) {
    let h = norm.indexOf(head, fromIndex);
    while (h !== -1) {
      for (const tail of tailCandidates) {
        const minEnd = h + Math.floor(totalWordChars * 0.6);
        const maxEnd = h + Math.ceil(totalWordChars * 1.5);
        let t = norm.indexOf(tail, Math.max(h + head.length, minEnd - tail.length));
        if (t !== -1 && t + tail.length <= maxEnd) {
          return toMatch(map, h, t + tail.length, false);
        }
      }
      h = norm.indexOf(head, h + 1);
    }
  }
  return null;
}

function findCharAnchors(norm: string, map: number[], q: string, fromIndex: number): Match | null {
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

/**
 * Cherche `quote` dans `haystack` (déjà normalisé via normalizeWithMap).
 * Stratégie robuste en plusieurs niveaux :
 * 1. Correspondance exacte directe après normalisation de base.
 * 2. Correspondance avec nettoyage des bruits de bordure (points de suspension ..., guillemets, ponctuation).
 * 3. Découpage en parties si la citation contient une ellipse interne ("partie A [...] partie B").
 * 4. Recherche flexible par mots insensible à la ponctuation interne (tirets, virgules, deux-points).
 * 5. Repli par ancres de mots (début et fin de citation).
 * 6. Repli caractère pour les longues citations altérées.
 */
export function findQuote(haystack: { norm: string; map: number[] }, quote: string, fromIndex = 0): Match | null {
  if (!quote) return null;
  const { norm, map } = haystack;

  // 1. Recherche directe exacte après normalisation de base
  const qBasic = normalize(quote).replace(/^["'\s]+|["'\s]+$/g, "");
  if (qBasic) {
    const idx = norm.indexOf(qBasic, fromIndex);
    if (idx !== -1) return toMatch(map, idx, idx + qBasic.length, true);
  }

  // 2. Recherche avec nettoyage des bruits de bordure
  const cleaned = cleanBoundary(quote);
  const qClean = normalize(cleaned);
  if (qClean && qClean !== qBasic) {
    const idx = norm.indexOf(qClean, fromIndex);
    if (idx !== -1) return toMatch(map, idx, idx + qClean.length, true);
  }

  // 3. Gestion des citations avec ellipses internes
  const parts = cleaned
    .split(/\s*(?:\.{3,}|…|\[\.{3,}\]|\[…\]|\(\.{3,}\)|\(…\))\s*/)
    .map((p) => normalize(cleanBoundary(p)))
    .filter((p) => p.length >= 3);

  if (parts.length >= 2) {
    const multiMatch = findMultiPart(norm, map, parts, fromIndex);
    if (multiMatch) return multiMatch;
  }

  // 4. Recherche par mots et ponctuation flexible
  const targetWords = (qClean || qBasic).split(/[\s,.;:!?\-–—«»"'/()[\]{}…]+/g).filter(Boolean);
  if (targetWords.length >= 2) {
    const punctMatch = findPunctuationFlexible(norm, map, targetWords, fromIndex);
    if (punctMatch) return punctMatch;
  }

  // 5. Repli par ancres de mots
  if (targetWords.length >= 4) {
    const anchorMatch = findWordAnchors(norm, map, targetWords, fromIndex);
    if (anchorMatch) return anchorMatch;
  }

  // 6. Repli caractère pour citations longues
  const q = qClean || qBasic;
  if (q.length >= ANCHOR_LEN * 2 + 8) {
    const charAnchor = findCharAnchors(norm, map, q, fromIndex);
    if (charAnchor) return charAnchor;
  }

  return null;
}
