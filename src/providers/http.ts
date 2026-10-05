import { ProviderError } from "./types";

/** Statuts passagers (quota par minute, surcharge, erreur serveur) retentés par postJson (A4). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
/** Nombre total d'essais, premier appel compris. */
export const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2_000;
/** Au-delà, l'attente demandée par `Retry-After` relève d'un quota épuisé : pas de nouvel essai. */
const MAX_DELAY_MS = 60_000;

export interface RetryInfo {
  /** Essai qui vient d'échouer (1 pour le premier appel). */
  attempt: number;
  delayMs: number;
  status: number;
}

/** Délai demandé par l'en-tête `Retry-After` (secondes ou date HTTP), en millisecondes. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** Délai avant l'essai suivant, ou null s'il ne faut pas retenter. */
export function retryDelay(status: number, retryAfter: string | null, attempt: number): number | null {
  if (!RETRYABLE_STATUSES.has(status) || attempt >= MAX_ATTEMPTS) return null;
  const delay = retryAfterMs(retryAfter) ?? BASE_DELAY_MS * 2 ** (attempt - 1);
  return delay > MAX_DELAY_MS ? null : delay;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Envoie une requête POST JSON et vérifie que la réponse HTTP est un succès.
 * Les statuts passagers sont retentés avec un délai croissant, en respectant
 * `Retry-After`, MAX_ATTEMPTS essais au plus ; `onRetry` est appelé avant chaque
 * attente. Lève un ProviderError typé http_error si le statut HTTP reste en échec.
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
  providerLabel: string,
  onRetry?: (info: RetryInfo) => void,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const raw = await res.text();
    const delayMs = retryDelay(res.status, res.headers.get("retry-after"), attempt);
    if (delayMs !== null) {
      onRetry?.({ attempt, delayMs, status: res.status });
      await sleep(delayMs, signal);
      continue;
    }
    let message = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
      if (typeof parsed.error === "object" && parsed.error?.message) {
        message = parsed.error.message;
      } else if (typeof parsed.error === "string") {
        message = parsed.error;
      } else if (parsed.message) {
        message = parsed.message;
      }
    } catch {
      // conserver raw tronqué
    }
    throw new ProviderError(`Erreur ${res.status} de ${providerLabel} : ${message}`, "http_error", `${res.status} : ${message}`);
  }
}
