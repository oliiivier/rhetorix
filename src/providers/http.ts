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
    const detail = (await res.text()).slice(0, 300);
    throw new ProviderError(`Erreur ${res.status} de ${providerLabel} : ${detail}`, "http_error", `${res.status} : ${detail}`);
  }
  return res;
}
