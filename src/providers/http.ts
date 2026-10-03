import { ProviderError } from "./types";

/**
 * Envoie une requête POST JSON et vérifie que la réponse HTTP est un succès.
 * Lève un ProviderError typé http_error si le statut HTTP est en échec.
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
  providerLabel: string,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const raw = await res.text();
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
  return res;
}
