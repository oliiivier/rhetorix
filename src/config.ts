// Configuration utilisateur, stockée dans storage.local (jamais sync : clé API).

import { ext } from "./ext";

export type ProviderId = "anthropic" | "openai-compatible" | "gemini" | "chrome-ai";
export type DisplayMode = "sidepanel" | "inline" | "both";

export interface Config {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** URL de base, utilisée uniquement par le provider compatible OpenAI (ex. https://api.openai.com/v1). */
  endpoint: string;
  /** "auto" = langue de l'interface du navigateur (décision D5). */
  language: string;
  /** Recherche web pour la vérification factuelle, si le provider la propose (décision D3). */
  webSearch: boolean;
  /** Taille maximale d'un morceau envoyé au LLM (décision D6). */
  maxChunkTokens: number;
  /** Mode d'affichage : panneau latéral, bulles au survol ou les deux. */
  displayMode: DisplayMode;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-5-5",
  "openai-compatible": "",
  gemini: "gemini-2.5-flash",
  "chrome-ai": "gemini-nano",
};

export const DEFAULT_CONFIG: Config = {
  provider: "anthropic",
  apiKey: "",
  model: DEFAULT_MODELS.anthropic,
  endpoint: "",
  language: "auto",
  webSearch: true,
  maxChunkTokens: 8_000,
  displayMode: "both",
};

const KEY = "config";

export async function loadConfig(): Promise<Config> {
  const stored = (await ext.storage.local.get(KEY))[KEY] as Partial<Config> | undefined;
  return { ...DEFAULT_CONFIG, ...stored };
}

export async function saveConfig(config: Config): Promise<void> {
  await ext.storage.local.set({ [KEY]: config });
}

export function isConfigured(c: Config): boolean {
  if (c.provider === "chrome-ai") return true;
  if (!c.model) return false;
  if (c.provider === "openai-compatible") return Boolean(c.endpoint);
  return Boolean(c.apiKey);
}

/** Origine à demander en host_permissions pour joindre l'API du provider. */
export function providerOrigin(c: Config): string | null {
  switch (c.provider) {
    case "anthropic":
      return "https://api.anthropic.com/*";
    case "gemini":
      return "https://generativelanguage.googleapis.com/*";
    case "chrome-ai":
      return null;
    case "openai-compatible":
      try {
        return `${new URL(c.endpoint).origin}/*`;
      } catch {
        return null;
      }
  }
}

export function resolveLanguage(c: Config): string {
  return c.language === "auto" ? ext.i18n.getUILanguage() : c.language;
}
