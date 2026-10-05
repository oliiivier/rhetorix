// Registre des adaptateurs de provider.

import type { ProviderId } from "../config";
import { anthropicProvider } from "./anthropic";
import { chromeAiProvider } from "./chrome-ai";
import { geminiProvider } from "./gemini";
import { openAiCompatibleProvider } from "./openai-compatible";
import type { LlmProvider } from "./types";

export const PROVIDERS: Record<ProviderId, LlmProvider> = {
  anthropic: anthropicProvider,
  "openai-compatible": openAiCompatibleProvider,
  gemini: geminiProvider,
  "chrome-ai": chromeAiProvider,
};
