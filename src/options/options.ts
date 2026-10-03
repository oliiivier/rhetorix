import { clearCache } from "../cache";
import { DEFAULT_MODELS, loadConfig, providerOrigin, saveConfig, type Config, type ProviderId } from "../config";
import { ext } from "../ext";

const form = document.getElementById("form") as HTMLFormElement;
const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) => form.elements.namedItem(name) as T;
const formStatus = document.getElementById("form-status")!;

const WEB_SEARCH_HINT: Record<ProviderId, string> = {
  anthropic: "Utilise l'outil de recherche web d'Anthropic (à activer pour votre organisation dans la console).",
  "openai-compatible": "Non disponible pour ce fournisseur : les vérifications seront marquées « non vérifié ».",
  gemini: "Pas encore disponible pour Gemini : les vérifications seront marquées « non vérifié ».",
};

function readForm(): Config {
  return {
    provider: field<HTMLSelectElement>("provider").value as ProviderId,
    endpoint: field<HTMLInputElement>("endpoint").value.trim(),
    apiKey: field<HTMLInputElement>("apiKey").value.trim(),
    model: field<HTMLInputElement>("model").value.trim(),
    language: field<HTMLSelectElement>("language").value,
    webSearch: field<HTMLInputElement>("webSearch").checked,
    maxChunkTokens: Math.max(2000, Number(field<HTMLInputElement>("maxChunkTokens").value) || 12_000),
  };
}

function fillForm(c: Config): void {
  field<HTMLSelectElement>("provider").value = c.provider;
  field<HTMLInputElement>("endpoint").value = c.endpoint;
  field<HTMLInputElement>("apiKey").value = c.apiKey;
  field<HTMLInputElement>("model").value = c.model;
  field<HTMLSelectElement>("language").value = c.language;
  field<HTMLInputElement>("webSearch").checked = c.webSearch;
  field<HTMLInputElement>("maxChunkTokens").value = String(c.maxChunkTokens);
  syncProvider();
}

function syncProvider(): void {
  const provider = field<HTMLSelectElement>("provider").value as ProviderId;
  document.getElementById("endpoint-field")!.hidden = provider !== "openai-compatible";
  field<HTMLInputElement>("endpoint").required = provider === "openai-compatible";
  field<HTMLInputElement>("apiKey").required = provider !== "openai-compatible";
  field<HTMLInputElement>("webSearch").disabled = provider !== "anthropic";
  document.getElementById("websearch-hint")!.textContent = WEB_SEARCH_HINT[provider];
  field<HTMLInputElement>("model").placeholder = DEFAULT_MODELS[provider] || "nom du modèle";
}

field<HTMLSelectElement>("provider").addEventListener("change", () => {
  const model = field<HTMLInputElement>("model");
  if (Object.values(DEFAULT_MODELS).includes(model.value)) {
    model.value = DEFAULT_MODELS[field<HTMLSelectElement>("provider").value as ProviderId];
  }
  syncProvider();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const config = readForm();
  const origin = providerOrigin(config);
  formStatus.className = "";
  if (!origin) {
    formStatus.textContent = "Endpoint invalide.";
    formStatus.className = "error";
    return;
  }
  // Demande de permission dans le geste utilisateur, avant tout await (exigé par Firefox).
  ext.permissions
    .request({ origins: [origin] })
    .then(async (granted) => {
      await saveConfig(config);
      formStatus.textContent = granted ? "Enregistré." : "Enregistré, mais l'accès à l'API a été refusé.";
      formStatus.className = granted ? "saved" : "error";
    })
    .catch((err: unknown) => {
      formStatus.textContent = `Erreur : ${err instanceof Error ? err.message : String(err)}`;
      formStatus.className = "error";
    });
});

document.getElementById("clear-cache")!.addEventListener("click", () => {
  void clearCache().then(() => (document.getElementById("cache-status")!.textContent = "Cache vidé."));
});

void loadConfig().then(fillForm);
