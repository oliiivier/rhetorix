// Adaptateur Mistral : API Chat Completions compatible OpenAI, à adresse fixe. La clé
// Mistral ne part jamais vers l'endpoint saisi pour le provider compatible OpenAI.
// Pas de recherche web dans cette API (elle relève de l'API Agents) : les allégations
// restent « non vérifiées » (D3).

import { chatCompletionsProvider } from "./openai-compatible";

export const MISTRAL_API = "https://api.mistral.ai/v1";

export const mistralProvider = chatCompletionsProvider({
  baseUrl: () => MISTRAL_API,
  label: "Mistral",
  webSearch: false,
  // Paramètre absent de l'API Mistral, qui renvoie l'usage dans le dernier événement.
  streamOptions: false,
});
