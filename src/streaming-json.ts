// Analyse progressive de flux JSON : extraction au fil de l'eau du résumé et
// des annotations individuelles au fur et à mesure que les tokens arrivent.

import { validateAnnotation, type Annotation } from "./schema";

export interface ProgressiveJsonCallbacks {
  onSummary?: (summary: string, isComplete: boolean) => void;
  onAnnotation?: (annotation: Annotation) => void;
}

/**
 * Dé-échappe une chaîne JSON partielle ou complète en gérant les séquences
 * d'échappement tronquées en fin de tampon (ex: \ ou \u00).
 */
export function unescapeJsonString(raw: string): string {
  let s = raw;
  const trailingSlash = s.match(/\\+$/);
  if (trailingSlash && trailingSlash[0].length % 2 === 1) {
    s = s.slice(0, -1);
  }
  const unicodeMatch = s.match(/\\u[0-9a-fA-F]{0,3}$/);
  if (unicodeMatch) {
    s = s.slice(0, unicodeMatch.index);
  }
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

/**
 * Retire les balises markdown ```json ... ``` si le modèle a enveloppé sa sortie.
 */
export function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return trimmed;
}

/**
 * Lit un ReadableStream de réponse HTTP ligne par ligne (SSE).
 */
export async function* readSseLines(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        yield line;
      }
    }
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Analyseur de flux JSON progressif.
 * Détecte l'arrivée de la clé "summary" et transmet le texte partiel ou complet.
 * Détecte le tableau "annotations" et extrait chaque objet JSON dès que ses
 * accolades s'équilibrent, en ignorant les accolades dans les chaînes.
 */
export class ProgressiveJsonParser {
  private buffer = "";
  private summaryCompleted = false;
  private lastEmittedSummary = "";
  private annotationsArrayStartIndex = -1;
  private annotationScanIndex = 0;
  private emittedAnnotationIds = new Set<string>();

  private callbacks: ProgressiveJsonCallbacks;

  constructor(callbacks: ProgressiveJsonCallbacks = {}) {
    this.callbacks = callbacks;
  }

  feed(chunk: string): void {
    this.buffer += chunk;
    this.processSummary();
    this.processAnnotations();
  }

  getRawText(): string {
    return this.buffer;
  }

  isSummaryComplete(): boolean {
    return this.summaryCompleted;
  }

  private processSummary(): void {
    if (this.summaryCompleted) return;
    const match = /"summary"\s*:\s*"/.exec(this.buffer);
    if (!match) return;
    const valueStartIndex = match.index + match[0].length;
    let inEscape = false;
    let endIndex = -1;
    for (let i = valueStartIndex; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (inEscape) {
        inEscape = false;
        continue;
      }
      if (c === "\\") {
        inEscape = true;
        continue;
      }
      if (c === '"') {
        endIndex = i;
        break;
      }
    }

    if (endIndex !== -1) {
      const raw = this.buffer.slice(valueStartIndex, endIndex);
      const summary = unescapeJsonString(raw);
      this.summaryCompleted = true;
      this.lastEmittedSummary = summary;
      this.callbacks.onSummary?.(summary, true);
    } else {
      const raw = this.buffer.slice(valueStartIndex);
      const summary = unescapeJsonString(raw);
      if (summary && summary !== this.lastEmittedSummary) {
        this.lastEmittedSummary = summary;
        this.callbacks.onSummary?.(summary, false);
      }
    }
  }

  private processAnnotations(): void {
    if (this.annotationsArrayStartIndex === -1) {
      const match = /"annotations"\s*:\s*\[/.exec(this.buffer);
      if (!match) return;
      this.annotationsArrayStartIndex = match.index + match[0].length;
      this.annotationScanIndex = this.annotationsArrayStartIndex;
    }

    while (this.annotationScanIndex < this.buffer.length) {
      const startIdx = this.buffer.indexOf("{", this.annotationScanIndex);
      if (startIdx === -1) {
        break;
      }

      const closingBracket = this.buffer.indexOf("]", this.annotationScanIndex);
      if (closingBracket !== -1 && closingBracket < startIdx) {
        this.annotationScanIndex = this.buffer.length;
        break;
      }

      let depth = 0;
      let inString = false;
      let inEscape = false;
      let matchEnd = -1;
      for (let i = startIdx; i < this.buffer.length; i++) {
        const ch = this.buffer[i];
        if (inEscape) {
          inEscape = false;
          continue;
        }
        if (ch === "\\" && inString) {
          inEscape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              matchEnd = i;
              break;
            }
          }
        }
      }

      if (matchEnd === -1) break;

      const objStr = this.buffer.slice(startIdx, matchEnd + 1);
      this.annotationScanIndex = matchEnd + 1;
      try {
        const parsed = JSON.parse(objStr) as unknown;
        const annotation = validateAnnotation(parsed);
        if (!this.emittedAnnotationIds.has(annotation.id)) {
          this.emittedAnnotationIds.add(annotation.id);
          this.callbacks.onAnnotation?.(annotation);
        }
      } catch {
        // Ignorer un objet invalide ou encore incomplet
      }
    }
  }
}
