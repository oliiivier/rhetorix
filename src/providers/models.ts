// Récupération dynamique et suggestions de modèles pour chaque fournisseur LLM.

import type { ProviderId } from "../config";

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

export const FALLBACK_MODELS: Record<ProviderId, ModelOption[]> = {
  gemini: [
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Recommandé, rapide)", description: "Dernière version économique" },
    { id: "gemini-3.8-pro", name: "Gemini 3.8 Pro (Raisonnement avancé)", description: "Haute précision" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Version antérieure" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Version antérieure Pro" },
  ],
  anthropic: [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5 (Recommandé)", description: "Performance maximale" },
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", description: "Équilibré et rapide" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Version stable" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Ultra-rapide" },
  ],
  "openai-compatible": [
    { id: "gpt-4o", name: "GPT-4o (OpenAI)", description: "Modèle standard polyvalent" },
    { id: "gpt-4o-mini", name: "GPT-4o mini (OpenAI)", description: "Rapide et économique" },
    { id: "mistral", name: "Mistral (Ollama local)", description: "Modèle local recommandé" },
    { id: "llama3.2", name: "Llama 3.2 (Ollama local)", description: "Modèle local compact" },
    { id: "sonar", name: "Perplexity Sonar", description: "Recherche web intégrée" },
  ],
  "chrome-ai": [
    { id: "gemini-nano", name: "Gemini Nano (Local / On-device)", description: "Exécution locale sans clé" },
  ],
};

export async function fetchAvailableModels(
  provider: ProviderId,
  apiKey: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<ModelOption[]> {
  const fallback = FALLBACK_MODELS[provider] || [];

  if (provider === "chrome-ai") {
    return fallback;
  }

  if (provider === "gemini") {
    if (!apiKey) return fallback;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { signal });
      if (!res.ok) return fallback;
      const data = (await res.json()) as {
        models?: Array<{
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      if (!data.models || !Array.isArray(data.models)) return fallback;
      const filtered = data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => {
          const rawId = (m.name ?? "").replace(/^models\//, "");
          return {
            id: rawId,
            name: m.displayName ? `${m.displayName} (${rawId})` : rawId,
          };
        })
        .filter((m) => Boolean(m.id));

      filtered.sort((a, b) => {
        const a38 = a.id.includes("3.8");
        const b38 = b.id.includes("3.8");
        if (a38 && !b38) return -1;
        if (!a38 && b38) return 1;

        const aFlash = a.id.toLowerCase().includes("flash");
        const bFlash = b.id.toLowerCase().includes("flash");
        if (aFlash && !bFlash) return -1;
        if (!aFlash && bFlash) return 1;
        return a.id.localeCompare(b.id);
      });

      return filtered.length > 0 ? filtered : fallback;
    } catch {
      return fallback;
    }
  }

  if (provider === "openai-compatible") {
    if (!endpoint) return fallback;
    try {
      const baseUrl = endpoint.replace(/\/+$/, "");
      const url = `${baseUrl}/models`;
      const headers: Record<string, string> = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(url, { headers, signal });
      if (!res.ok) return fallback;
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      if (!data.data || !Array.isArray(data.data)) return fallback;
      const models = data.data.map((m) => ({ id: m.id, name: m.id })).filter((m) => Boolean(m.id));
      return models.length > 0 ? models : fallback;
    } catch {
      return fallback;
    }
  }

  if (provider === "anthropic") {
    if (!apiKey) return fallback;
    try {
      const baseUrl = endpoint ? endpoint.trim().replace(/\/+$/, "") : "https://api.anthropic.com";
      const url = `${baseUrl}/v1/models`;
      const clean = apiKey.trim();
      const isOAuth = clean.startsWith("sk-ant-oat") || clean.startsWith("Bearer ");
      const token = clean.replace(/^Bearer\s+/i, "");
      const headers: Record<string, string> = {
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };
      if (isOAuth) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["anthropic-beta"] = "oauth-2025-04-20";
      } else {
        headers["x-api-key"] = token;
      }
      const res = await fetch(url, { headers, signal });
      if (!res.ok) return fallback;
      const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
      if (!data.data || !Array.isArray(data.data)) return fallback;
      const models = data.data
        .map((m) => ({
          id: m.id,
          name: m.display_name ? `${m.display_name} (${m.id})` : m.id,
        }))
        .filter((m) => Boolean(m.id));
      return models.length > 0 ? models : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}
