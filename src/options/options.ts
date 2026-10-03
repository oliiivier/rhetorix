import { clearCache } from "../cache";
import { DEFAULT_MODELS, loadConfig, providerOrigin, saveConfig, type Config, type DisplayMode, type ProviderId } from "../config";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";

const form = document.getElementById("form") as HTMLFormElement;
const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) => form.elements.namedItem(name) as T;
const formStatus = document.getElementById("form-status")!;

function setTxt(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHintWithCode(id: string, text: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.replaceChildren();
  const parts = text.split(/(<code>.*?<\/code>)/g);
  for (const part of parts) {
    if (part.startsWith("<code>") && part.endsWith("</code>")) {
      const code = document.createElement("code");
      code.textContent = part.slice(6, -7);
      el.append(code);
    } else if (part) {
      el.append(document.createTextNode(part));
    }
  }
}

function applyOptionsI18n(lang: string): void {
  const t = getUiStrings(lang);
  document.title = t.optionsTitle;
  setTxt("title", t.optionsTitle);
  setTxt("lbl-provider", t.providerLabel);
  setTxt("opt-chrome-ai", t.chromeAiOption);
  setTxt("chrome-ai-hint", t.chromeAiHint);
  setTxt("lbl-endpoint", t.endpointLabel);
  setTxt("btn-preset-ollama", t.presetOllamaBtn);
  setHintWithCode("endpoint-hint", t.endpointHint);
  setHintWithCode("endpoint-ollama-hint", t.endpointOllamaHint);
  setTxt("lbl-api-key", t.apiKeyLabel);
  setTxt("api-key-hint", t.apiKeyHint);
  setTxt("btn-get-gemini-key", t.getGeminiKeyBtn);
  setTxt("btn-get-anthropic-key", t.getAnthropicKeyBtn);
  setTxt("lbl-model", t.modelLabel);
  setTxt("lbl-language", t.languageLabel);
  setTxt("lbl-display-mode", t.displayModeLabel);
  setTxt("display-mode-hint", t.displayModeHint);
  setTxt("opt-mode-both", t.displayModes.both);
  setTxt("opt-mode-inline", t.displayModes.inline);
  setTxt("opt-mode-sidepanel", t.displayModes.sidepanel);
  setTxt("lbl-web-search", t.webSearchLabel);
  setTxt("lbl-max-chunk", t.maxChunkLabel);
  setTxt("max-chunk-hint", t.maxChunkHint);
  setTxt("btn-save", t.saveBtn);
  setTxt("heading-cache", t.cacheSectionTitle);
  setTxt("clear-cache", t.clearCacheBtn);
  setTxt("heading-privacy", t.privacySectionTitle);
  setTxt("privacy-text", t.privacyText);
  syncProvider();
}

function readForm(): Config {
  return {
    provider: field<HTMLSelectElement>("provider").value as ProviderId,
    endpoint: field<HTMLInputElement>("endpoint").value.trim(),
    apiKey: field<HTMLInputElement>("apiKey").value.trim(),
    model: field<HTMLInputElement>("model").value.trim(),
    language: field<HTMLSelectElement>("language").value,
    displayMode: field<HTMLSelectElement>("displayMode").value as DisplayMode,
    webSearch: field<HTMLInputElement>("webSearch").checked,
    maxChunkTokens: Math.max(2000, Number(field<HTMLInputElement>("maxChunkTokens").value) || 8_000),
  };
}

function fillForm(c: Config): void {
  field<HTMLSelectElement>("provider").value = c.provider;
  field<HTMLInputElement>("endpoint").value = c.endpoint;
  field<HTMLInputElement>("apiKey").value = c.apiKey;
  field<HTMLInputElement>("model").value = c.model;
  field<HTMLSelectElement>("language").value = c.language;
  field<HTMLSelectElement>("displayMode").value = c.displayMode ?? "both";
  field<HTMLInputElement>("webSearch").checked = c.webSearch;
  field<HTMLInputElement>("maxChunkTokens").value = String(c.maxChunkTokens);
  applyOptionsI18n(c.language);
}

function syncProvider(): void {
  const provider = field<HTMLSelectElement>("provider").value as ProviderId;
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);

  const isChromeAi = provider === "chrome-ai";
  const isOpenAi = provider === "openai-compatible";

  document.getElementById("chrome-ai-info")!.hidden = !isChromeAi;
  document.getElementById("endpoint-field")!.hidden = !isOpenAi;
  document.getElementById("api-key-field")!.hidden = isChromeAi;
  document.getElementById("model-field")!.hidden = isChromeAi;
  document.getElementById("websearch-field")!.hidden = isChromeAi;

  field<HTMLInputElement>("endpoint").required = isOpenAi;
  field<HTMLInputElement>("apiKey").required = provider === "anthropic" || provider === "gemini";
  field<HTMLInputElement>("model").required = !isChromeAi;

  if (isOpenAi) {
    field<HTMLInputElement>("apiKey").placeholder = t.apiKeyPlaceholderOllama;
  } else {
    field<HTMLInputElement>("apiKey").placeholder = "";
  }

  // Boutons d'aide d'obtention de clés
  document.getElementById("btn-get-gemini-key")!.hidden = provider !== "gemini";
  document.getElementById("btn-get-anthropic-key")!.hidden = provider !== "anthropic";

  field<HTMLInputElement>("webSearch").disabled = false;
  if (provider === "anthropic") {
    document.getElementById("websearch-hint")!.textContent = t.webSearchHintAnthropic;
  } else if (provider === "gemini") {
    document.getElementById("websearch-hint")!.textContent = t.webSearchHintGemini;
  } else if (isOpenAi) {
    document.getElementById("websearch-hint")!.textContent = t.webSearchHintOpenAi;
  }
  field<HTMLInputElement>("model").placeholder = DEFAULT_MODELS[provider] || "model name";
}

field<HTMLSelectElement>("provider").addEventListener("change", () => {
  const model = field<HTMLInputElement>("model");
  if (Object.values(DEFAULT_MODELS).includes(model.value) || !model.value) {
    model.value = DEFAULT_MODELS[field<HTMLSelectElement>("provider").value as ProviderId];
  }
  syncProvider();
});

field<HTMLSelectElement>("language").addEventListener("change", () => {
  applyOptionsI18n(field<HTMLSelectElement>("language").value);
});

// Bouton de pré-remplissage pour Ollama local (Option D)
document.getElementById("btn-preset-ollama")?.addEventListener("click", () => {
  field<HTMLInputElement>("endpoint").value = "http://localhost:11434/v1";
  field<HTMLInputElement>("model").value = "mistral";
  field<HTMLInputElement>("apiKey").value = "";
  field<HTMLInputElement>("webSearch").checked = false;
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);
  formStatus.textContent = t.presetOllamaSuccess;
  formStatus.className = "saved";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const config = readForm();
  const t = getUiStrings(config.language);
  formStatus.className = "";

  // Pour Chrome Built-in AI, aucun accès réseau externe n'est requis
  if (config.provider === "chrome-ai") {
    void saveConfig(config).then(() => {
      formStatus.textContent = t.savedSuccess;
      formStatus.className = "saved";
    });
    return;
  }

  const origin = providerOrigin(config);
  if (!origin) {
    formStatus.textContent = t.invalidEndpoint;
    formStatus.className = "error";
    return;
  }
  // Demande de permission dans le geste utilisateur, avant tout await (exigé par Firefox).
  ext.permissions
    .request({ origins: [origin] })
    .then(async (granted) => {
      await saveConfig(config);
      formStatus.textContent = granted ? t.savedSuccess : t.savedPermissionDenied;
      formStatus.className = granted ? "saved" : "error";
    })
    .catch((err: unknown) => {
      formStatus.textContent = t.errorPrefix(err instanceof Error ? err.message : String(err));
      formStatus.className = "error";
    });
});

document.getElementById("clear-cache")!.addEventListener("click", () => {
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);
  void clearCache().then(() => (document.getElementById("cache-status")!.textContent = t.cacheCleared));
});

void loadConfig().then(fillForm);
