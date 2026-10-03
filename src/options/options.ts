import { clearCache } from "../cache";
import { DEFAULT_MODELS, loadConfig, providerOrigin, saveConfig, type Config, type DisplayMode, type ProviderId } from "../config";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";
import { FALLBACK_MODELS, fetchAvailableModels, type ModelOption } from "../providers/models";

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
  setTxt("btn-preset-claude-bridge", t.presetClaudeBridgeBtn);
  setHintWithCode("endpoint-hint", t.endpointHint);
  setHintWithCode("endpoint-ollama-hint", t.endpointOllamaHint);
  setTxt("lbl-api-key", t.apiKeyLabel);
  setTxt("api-key-hint", t.apiKeyHint);
  setTxt("btn-get-gemini-key", t.getGeminiKeyBtn);
  setTxt("btn-get-anthropic-key", t.getAnthropicKeyBtn);
  setTxt("lbl-anthropic-auth-mode", t.anthropicAuthModeLabel);
  setTxt("btn-anthropic-mode-apikey", t.anthropicModeApiKey);
  setTxt("btn-anthropic-mode-oauth", t.anthropicModeOAuth);
  setTxt("btn-copy-setup-token", t.copySetupTokenBtn);
  setTxt("btn-switch-to-bridge", t.presetClaudeBridgeBtn);
  setTxt("lbl-model", t.modelLabel);
  setTxt("btn-toggle-custom-model", isCustomModelMode ? t.toggleSelectModelBtn : t.toggleCustomModelBtn);
  setTxt("btn-refresh-models", t.refreshModelsBtn);
  setTxt("model-hint", t.modelHint);
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

let anthropicAuthMode: "api-key" | "oauth" = "api-key";

function setAnthropicAuthMode(mode: "api-key" | "oauth", lang?: string): void {
  anthropicAuthMode = mode;
  const t = getUiStrings(lang || field<HTMLSelectElement>("language")?.value || "auto");
  const btnApiKey = document.getElementById("btn-anthropic-mode-apikey");
  const btnOAuth = document.getElementById("btn-anthropic-mode-oauth");
  const lblApiKey = document.getElementById("lbl-api-key");
  const apiKeyHint = document.getElementById("api-key-hint");
  const btnGetAnthropic = document.getElementById("btn-get-anthropic-key");
  const btnCopySetup = document.getElementById("btn-copy-setup-token");
  const btnSwitchBridge = document.getElementById("btn-switch-to-bridge");
  const inputApiKey = field<HTMLInputElement>("apiKey");

  if (mode === "oauth") {
    btnApiKey?.classList.remove("active");
    btnOAuth?.classList.add("active");
    if (lblApiKey) lblApiKey.textContent = t.apiKeyLabelOAuth;
    if (apiKeyHint) apiKeyHint.textContent = t.apiKeyHintOAuth;
    if (btnGetAnthropic) btnGetAnthropic.hidden = true;
    if (btnCopySetup) btnCopySetup.hidden = false;
    if (btnSwitchBridge) btnSwitchBridge.hidden = false;
    inputApiKey.placeholder = "sk-ant-oat01-...";
  } else {
    btnOAuth?.classList.remove("active");
    btnApiKey?.classList.add("active");
    if (lblApiKey) lblApiKey.textContent = t.apiKeyLabel;
    if (apiKeyHint) apiKeyHint.textContent = t.apiKeyHint;
    if (btnGetAnthropic) btnGetAnthropic.hidden = false;
    if (btnCopySetup) btnCopySetup.hidden = true;
    if (btnSwitchBridge) btnSwitchBridge.hidden = true;
    inputApiKey.placeholder = "sk-ant-api03-...";
  }
}

let isCustomModelMode = false;

function setCustomModelMode(custom: boolean, lang?: string): void {
  isCustomModelMode = custom;
  const select = document.getElementById("model-select") as HTMLSelectElement | null;
  const input = document.getElementById("input-model") as HTMLInputElement | null;
  const toggleBtn = document.getElementById("btn-toggle-custom-model") as HTMLButtonElement | null;
  const t = getUiStrings(lang || field<HTMLSelectElement>("language")?.value || "auto");

  if (!select || !input || !toggleBtn) return;

  const provider = field<HTMLSelectElement>("provider")?.value as ProviderId;
  const isChromeAi = provider === "chrome-ai";

  if (custom) {
    select.hidden = true;
    input.hidden = false;
    select.required = false;
    input.required = !isChromeAi;
    toggleBtn.textContent = t.toggleSelectModelBtn;
  } else {
    input.hidden = true;
    select.hidden = false;
    input.required = false;
    select.required = !isChromeAi;
    toggleBtn.textContent = t.toggleCustomModelBtn;
  }
}

function populateModelSelect(models: ModelOption[]): void {
  const select = document.getElementById("model-select") as HTMLSelectElement | null;
  const input = document.getElementById("input-model") as HTMLInputElement | null;
  if (!select || !input) return;

  const currentVal = input.value.trim();
  select.replaceChildren();

  let hasCurrentVal = false;
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === currentVal) {
      opt.selected = true;
      hasCurrentVal = true;
    }
    select.appendChild(opt);
  }

  if (currentVal && !hasCurrentVal) {
    const customOpt = document.createElement("option");
    customOpt.value = currentVal;
    customOpt.textContent = `${currentVal} (actuel)`;
    customOpt.selected = true;
    select.prepend(customOpt);
  } else if (!currentVal && select.options.length > 0) {
    input.value = select.value;
  }
}

async function refreshModels(interactive = false): Promise<void> {
  const provider = field<HTMLSelectElement>("provider").value as ProviderId;
  const apiKey = field<HTMLInputElement>("apiKey").value.trim();
  const endpoint = field<HTMLInputElement>("endpoint").value.trim();
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);
  const statusEl = document.getElementById("models-status");

  if (provider === "chrome-ai") {
    populateModelSelect(FALLBACK_MODELS["chrome-ai"]);
    return;
  }

  if (interactive && statusEl) {
    statusEl.textContent = t.refreshingModels;
    statusEl.className = "hint";
  }

  try {
    const models = await fetchAvailableModels(provider, apiKey, endpoint);
    populateModelSelect(models);

    if (interactive && statusEl) {
      statusEl.textContent = t.modelsFound(models.length);
      statusEl.className = "hint saved";
      setTimeout(() => {
        if (statusEl.textContent === t.modelsFound(models.length)) statusEl.textContent = "";
      }, 4000);
    }
  } catch (err) {
    if (interactive && statusEl) {
      statusEl.textContent = t.errorPrefix(err instanceof Error ? err.message : String(err));
      statusEl.className = "hint error";
    }
  }
}

function readForm(): Config {
  const modelVal = isCustomModelMode
    ? field<HTMLInputElement>("model").value.trim()
    : ((document.getElementById("model-select") as HTMLSelectElement | null)?.value?.trim() || field<HTMLInputElement>("model").value.trim());

  return {
    provider: field<HTMLSelectElement>("provider").value as ProviderId,
    endpoint: field<HTMLInputElement>("endpoint").value.trim(),
    apiKey: field<HTMLInputElement>("apiKey").value.trim(),
    model: modelVal,
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
  if (c.provider === "anthropic") {
    anthropicAuthMode = c.apiKey.startsWith("sk-ant-oat") ? "oauth" : "api-key";
  }
  populateModelSelect(FALLBACK_MODELS[c.provider] || []);
  setCustomModelMode(false, c.language);
  applyOptionsI18n(c.language);
}

function syncProvider(): void {
  const provider = field<HTMLSelectElement>("provider").value as ProviderId;
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);

  const isChromeAi = provider === "chrome-ai";
  const isOpenAi = provider === "openai-compatible";
  const isAnthropic = provider === "anthropic";

  document.getElementById("chrome-ai-info")!.hidden = !isChromeAi;
  document.getElementById("endpoint-field")!.hidden = !isOpenAi;
  document.getElementById("api-key-field")!.hidden = isChromeAi;
  document.getElementById("model-field")!.hidden = isChromeAi;
  document.getElementById("websearch-field")!.hidden = isChromeAi;
  document.getElementById("anthropic-auth-mode-group")!.hidden = !isAnthropic;

  field<HTMLInputElement>("endpoint").required = isOpenAi;
  field<HTMLInputElement>("apiKey").required = isAnthropic || provider === "gemini";
  setCustomModelMode(isCustomModelMode, lang);

  if (isAnthropic) {
    const keyVal = field<HTMLInputElement>("apiKey").value.trim();
    if (keyVal.startsWith("sk-ant-oat")) {
      anthropicAuthMode = "oauth";
    }
    setAnthropicAuthMode(anthropicAuthMode, lang);
  } else {
    document.getElementById("btn-copy-setup-token")!.hidden = true;
    document.getElementById("btn-get-anthropic-key")!.hidden = true;
    document.getElementById("btn-get-gemini-key")!.hidden = provider !== "gemini";
    setTxt("lbl-api-key", t.apiKeyLabel);
    setTxt("api-key-hint", t.apiKeyHint);
    if (isOpenAi) {
      field<HTMLInputElement>("apiKey").placeholder = t.apiKeyPlaceholderOllama;
    } else {
      field<HTMLInputElement>("apiKey").placeholder = "";
    }
  }

  // Suggestions de modèles
  populateModelSelect(FALLBACK_MODELS[provider] || []);

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
  const prov = field<HTMLSelectElement>("provider").value as ProviderId;
  if (Object.values(DEFAULT_MODELS).includes(model.value) || !model.value) {
    model.value = DEFAULT_MODELS[prov] || "";
  }
  if (prov === "gemini") {
    // Par défaut pour Gemini, désactiver la recherche web pour préserver le quota gratuit (Pay-as-you-go requis pour Google Search)
    field<HTMLInputElement>("webSearch").checked = false;
  }
  setCustomModelMode(false);
  syncProvider();
  void refreshModels(false);
});

const modelSelect = document.getElementById("model-select") as HTMLSelectElement | null;
modelSelect?.addEventListener("change", () => {
  const model = field<HTMLInputElement>("model");
  if (model && modelSelect) {
    model.value = modelSelect.value;
  }
});

document.getElementById("btn-toggle-custom-model")?.addEventListener("click", () => {
  const nextMode = !isCustomModelMode;
  setCustomModelMode(nextMode);
  const input = field<HTMLInputElement>("model");
  const select = document.getElementById("model-select") as HTMLSelectElement | null;
  if (nextMode) {
    input?.focus();
  } else if (select && input) {
    if (input.value) {
      let found = false;
      for (const opt of Array.from(select.options)) {
        if (opt.value === input.value) {
          opt.selected = true;
          found = true;
          break;
        }
      }
      if (!found) {
        const customOpt = document.createElement("option");
        customOpt.value = input.value;
        customOpt.textContent = `${input.value} (personnalisé)`;
        customOpt.selected = true;
        select.prepend(customOpt);
      }
    } else if (select.value) {
      input.value = select.value;
    }
  }
});

document.getElementById("btn-anthropic-mode-apikey")?.addEventListener("click", () => {
  setAnthropicAuthMode("api-key");
});

document.getElementById("btn-anthropic-mode-oauth")?.addEventListener("click", () => {
  setAnthropicAuthMode("oauth");
});

document.getElementById("btn-copy-setup-token")?.addEventListener("click", () => {
  void navigator.clipboard.writeText("claude setup-token").then(() => {
    const t = getUiStrings(field<HTMLSelectElement>("language")?.value || "auto");
    const btn = document.getElementById("btn-copy-setup-token");
    if (!btn) return;
    const oldText = btn.textContent;
    btn.textContent = `✔ ${t.copiedToClipboard}`;
    setTimeout(() => {
      btn.textContent = oldText;
    }, 2500);
  });
});

field<HTMLInputElement>("apiKey").addEventListener("input", () => {
  const prov = field<HTMLSelectElement>("provider")?.value;
  if (prov === "anthropic") {
    const val = field<HTMLInputElement>("apiKey").value.trim();
    if (val.startsWith("sk-ant-oat") && anthropicAuthMode !== "oauth") {
      setAnthropicAuthMode("oauth");
    } else if (val.startsWith("sk-ant-api") && anthropicAuthMode !== "api-key") {
      setAnthropicAuthMode("api-key");
    }
  }
});

field<HTMLInputElement>("apiKey").addEventListener("change", () => {
  if (field<HTMLInputElement>("apiKey").value.trim()) {
    void refreshModels(false);
  }
});

field<HTMLInputElement>("endpoint").addEventListener("change", () => {
  if (field<HTMLInputElement>("endpoint").value.trim()) {
    void refreshModels(false);
  }
});

document.getElementById("btn-refresh-models")?.addEventListener("click", () => {
  void refreshModels(true);
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
  populateModelSelect(FALLBACK_MODELS["openai-compatible"]);
  setCustomModelMode(false);
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);
  formStatus.textContent = t.presetOllamaSuccess;
  formStatus.className = "saved";
});

function activateClaudeBridgePreset(): void {
  field<HTMLSelectElement>("provider").value = "openai-compatible";
  field<HTMLInputElement>("endpoint").value = "http://localhost:8080/v1";
  field<HTMLInputElement>("model").value = "claude-3-7-sonnet-20250219";
  field<HTMLInputElement>("webSearch").checked = false;
  syncProvider();
  populateModelSelect([
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet (Pont local)" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Pont local)" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku (Pont local)" },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5 (Pont local)" },
  ]);
  setCustomModelMode(false);
  const lang = field<HTMLSelectElement>("language")?.value || "auto";
  const t = getUiStrings(lang);
  formStatus.textContent = t.presetClaudeBridgeSuccess;
  formStatus.className = "saved";
}

document.getElementById("btn-preset-claude-bridge")?.addEventListener("click", activateClaudeBridgePreset);
document.getElementById("btn-switch-to-bridge")?.addEventListener("click", activateClaudeBridgePreset);

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
