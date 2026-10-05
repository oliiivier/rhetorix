import { clearCache } from "../cache";
import { CONTESTED_KEY, issueUrl, loadContested, markReported, removeContested, type ContestedAnnotation } from "../contested";
import { DEFAULT_MODELS, loadConfig, providerOrigin, saveConfig, type Config, type DisplayMode, type ProviderId, type YouTubePauseMode } from "../config";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";
import { FALLBACK_MODELS, fetchAvailableModels, type ModelOption } from "../providers/models";
import { LABELS, labelDef, type Category } from "../taxonomy";
import { formatTokenCount, loadTokenStats, resetTokenStats, setMonthlyResetDay } from "../tokens";

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
  setTxt("lbl-analysis-depth", t.analysisDepthLabel);
  setTxt("opt-depth-fast", t.analysisDepths.fast);
  setTxt("opt-depth-deep", t.analysisDepths.deep);
  setTxt("analysis-depth-hint", t.analysisDepthHint);
  setTxt("lbl-max-chunk", t.maxChunkLabel);
  setTxt("max-chunk-hint", t.maxChunkHint);
  setTxt("btn-save", t.saveBtn);
  setTxt("heading-cache", t.cacheSectionTitle);
  setTxt("clear-cache", t.clearCacheBtn);
  setTxt("heading-contested", t.contestedSectionTitle);
  setTxt("contested-intro", t.contestedIntro);
  void renderContested(lang);
  setTxt("tab-label-tokens", t.tabTokens);
  setTxt("tokens-tab-intro", t.tokensTabIntro);
  setTxt("heading-tokens-tab", t.tabTokens);
  setTxt("heading-tokens", t.tokensSectionTitle);
  setTxt("lbl-tokens-period", t.tokensPeriodLabel);
  setTxt("lbl-tokens-alltime", t.tokensAllTimeLabel);
  setTxt("lbl-monthly-reset", t.tokensMonthlyResetLabel);
  setTxt("opt-reset-disabled", t.tokensResetDisabled);
  setTxt("tokens-monthly-hint", t.monthlyResetHint);
  setTxt("btn-reset-tokens", t.tokensResetBtn);
  setTxt("heading-quotas-help", t.quotasHelpHeading);

  const selectResetDay = document.getElementById("monthly-reset-day") as HTMLSelectElement | null;
  if (selectResetDay) {
    for (const opt of selectResetDay.options) {
      const day = parseInt(opt.value, 10);
      if (day === 0) opt.textContent = t.tokensResetDisabled;
      else opt.textContent = t.tokensResetDayOption(day);
    }
  }

  setTxt("heading-privacy", t.privacySectionTitle);
  setTxt("privacy-text", t.privacyText);

  // YouTube
  setTxt("heading-youtube", t.youtubeSectionTitle);
  setTxt("lbl-yt-chunk-minutes", t.youtubeChunkMinutesLabel);
  setTxt("lbl-yt-min-display", t.youtubeMinDisplayLabel);
  setTxt("lbl-yt-pause-mode", t.youtubePauseModeLabel);
  setTxt("opt-yt-pause-none", t.youtubePauseModeNone);
  setTxt("opt-yt-pause-start", t.youtubePauseModeStart);
  setTxt("opt-yt-pause-after", t.youtubePauseModeAfter);
  setTxt("lbl-yt-auto-resume", t.youtubeAutoResumeLabel);
  setTxt("lbl-yt-auto-resume-duration", t.youtubeAutoResumeDurationLabel);
  setTxt("lbl-yt-timeline-markers", t.youtubeTimelineMarkersLabel);

  // Onglets et Guide
  setTxt("tab-label-settings", t.tabSettings);
  setTxt("tab-label-guide", t.tabGuide);
  setTxt("guide-intro", t.guideIntro);

  setTxt("guide-cap-heading", t.guideCapabilitiesHeading);
  setTxt("guide-cap-1-title", `🧠 ${t.guideCap1Title}`);
  setTxt("guide-cap-1-desc", t.guideCap1Desc);
  setTxt("guide-cap-2-title", `🔍 ${t.guideCap2Title}`);
  setTxt("guide-cap-2-desc", t.guideCap2Desc);
  setTxt("guide-cap-3-title", `📑 ${t.guideCap3Title}`);
  setTxt("guide-cap-3-desc", t.guideCap3Desc);
  setTxt("guide-cap-4-title", `⚡ ${t.guideCap4Title}`);
  setTxt("guide-cap-4-desc", t.guideCap4Desc);
  setTxt("guide-cap-5-title", `🎨 ${t.guideCap5Title}`);
  setTxt("guide-cap-5-desc", t.guideCap5Desc);
  setTxt("guide-cap-6-title", `🔒 ${t.guideCap6Title}`);
  setTxt("guide-cap-6-desc", t.guideCap6Desc);

  setTxt("guide-colors-heading", t.guideColorsHeading);
  setTxt("guide-colors-intro", t.guideColorsIntro);
  setTxt("badge-demo-sophism", t.categories.sophism);
  setTxt("guide-color-sophism-title", t.guideColorSophismTitle);
  setTxt("guide-color-sophism-sample", t.guideColorSophismSample);
  setTxt("guide-color-sophism-desc", t.guideColorSophismDesc);

  setTxt("badge-demo-bias", t.categories.bias);
  setTxt("guide-color-bias-title", t.guideColorBiasTitle);
  setTxt("guide-color-bias-sample", t.guideColorBiasSample);
  setTxt("guide-color-bias-desc", t.guideColorBiasDesc);

  setTxt("badge-demo-factual", t.categories.factual_claim);
  setTxt("guide-color-factual-title", t.guideColorFactualTitle);
  setTxt("guide-color-factual-sample", t.guideColorFactualSample);
  setTxt("guide-color-factual-desc", t.guideColorFactualDesc);

  setTxt("badge-demo-active", "Actif");
  setTxt("guide-color-active-title", t.guideColorActiveTitle);
  setTxt("guide-color-active-sample", t.guideColorActiveSample);
  setTxt("guide-color-active-desc", t.guideColorActiveDesc);

  setTxt("guide-fact-heading", t.guideFactCheckHeading);
  setTxt("guide-fact-intro", t.guideFactCheckIntro);
  setTxt("guide-fact-supported-title", t.guideFactSupportedTitle);
  setTxt("guide-fact-supported-desc", t.guideFactSupportedDesc);
  setTxt("guide-fact-refuted-title", t.guideFactRefutedTitle);
  setTxt("guide-fact-refuted-desc", t.guideFactRefutedDesc);
  setTxt("guide-fact-misleading-title", t.guideFactMisleadingTitle);
  setTxt("guide-fact-misleading-desc", t.guideFactMisleadingDesc);
  setTxt("guide-fact-unverified-title", t.guideFactUnverifiedTitle);
  setTxt("guide-fact-unverified-desc", t.guideFactUnverifiedDesc);

  setTxt("guide-severity-heading", t.guideSeverityHeading);
  setTxt("guide-severity-intro", t.guideSeverityIntro);
  setTxt("guide-severity-low-title", t.guideSeverityLowTitle);
  setTxt("guide-severity-low-desc", t.guideSeverityLowDesc);
  setTxt("guide-severity-medium-title", t.guideSeverityMediumTitle);
  setTxt("guide-severity-medium-desc", t.guideSeverityMediumDesc);
  setTxt("guide-severity-high-title", t.guideSeverityHighTitle);
  setTxt("guide-severity-high-desc", t.guideSeverityHighDesc);

  setTxt("guide-taxonomy-heading", t.guideTaxonomyHeading);
  setTxt("guide-taxonomy-intro", t.guideTaxonomyIntro);

  renderTaxonomyGuide(lang);
  syncProvider();
}

function renderTaxonomyGuide(lang: string): void {
  const container = document.getElementById("taxonomy-container");
  if (!container) return;
  container.replaceChildren();

  const t = getUiStrings(lang);
  const categories: Category[] = ["sophism", "bias", "factual_claim"];

  for (const cat of categories) {
    const details = document.createElement("details");
    details.className = "taxonomy-category-details";
    if (cat === "sophism") details.open = true;

    const summary = document.createElement("summary");
    summary.className = "taxonomy-category-summary";

    const badge = document.createElement("span");
    badge.className = `badge ${cat}`;
    badge.textContent = t.categories[cat];

    const count = Object.keys(LABELS[cat]).length;
    const countSpan = document.createElement("span");
    countSpan.className = "taxonomy-category-count";
    countSpan.textContent = ` (${count})`;

    summary.append(badge, countSpan);
    details.appendChild(summary);

    const dl = document.createElement("dl");
    dl.className = "taxonomy-list";

    for (const key of Object.keys(LABELS[cat])) {
      const def = labelDef(cat, key, lang);
      if (!def) continue;

      const dt = document.createElement("dt");
      dt.className = "taxonomy-term";
      dt.textContent = def.name;

      const dd = document.createElement("dd");
      dd.className = "taxonomy-desc";
      dd.textContent = def.definition;

      dl.append(dt, dd);
    }

    details.appendChild(dl);
    container.appendChild(details);
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
    analysisDepth: field<HTMLSelectElement>("analysisDepth").value === "deep" ? "deep" : "fast",
    youtubeChunkMinutes: Math.max(5, Math.min(60, Number(field<HTMLInputElement>("youtubeChunkMinutes").value) || 15)),
    youtubeMinDisplayDuration: Math.max(2, Math.min(30, Number(field<HTMLInputElement>("youtubeMinDisplayDuration").value) || 6)),
    youtubePauseMode: (field<HTMLSelectElement>("youtubePauseMode")?.value || "none") as YouTubePauseMode,
    youtubeAutoResume: field<HTMLInputElement>("youtubeAutoResume").checked,
    youtubeAutoResumeDuration: Math.max(2, Math.min(15, Number(field<HTMLInputElement>("youtubeAutoResumeDuration").value) || 5)),
    youtubeShowTimelineMarkers: field<HTMLInputElement>("youtubeShowTimelineMarkers").checked,
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
  field<HTMLSelectElement>("analysisDepth").value = c.analysisDepth ?? "fast";
  field<HTMLInputElement>("youtubeChunkMinutes").value = String(c.youtubeChunkMinutes ?? 15);
  field<HTMLInputElement>("youtubeMinDisplayDuration").value = String(c.youtubeMinDisplayDuration ?? 6);
  field<HTMLSelectElement>("youtubePauseMode").value = c.youtubePauseMode ?? "none";
  field<HTMLInputElement>("youtubeAutoResume").checked = c.youtubeAutoResume ?? true;
  field<HTMLInputElement>("youtubeAutoResumeDuration").value = String(c.youtubeAutoResumeDuration ?? 5);
  field<HTMLInputElement>("youtubeShowTimelineMarkers").checked = c.youtubeShowTimelineMarkers ?? true;
  populateModelSelect(FALLBACK_MODELS[c.provider] || []);
  setCustomModelMode(false, c.language);
  applyOptionsI18n(c.language);
  void refreshTokensDisplay(c.language);
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

  field<HTMLInputElement>("endpoint").required = isOpenAi;
  field<HTMLInputElement>("apiKey").required = isAnthropic || provider === "gemini";
  setCustomModelMode(isCustomModelMode, lang);

  document.getElementById("btn-get-anthropic-key")!.hidden = !isAnthropic;
  document.getElementById("btn-get-gemini-key")!.hidden = provider !== "gemini";
  setTxt("lbl-api-key", t.apiKeyLabel);
  setTxt("api-key-hint", t.apiKeyHint);
  if (isAnthropic) {
    field<HTMLInputElement>("apiKey").placeholder = "sk-ant-api03-...";
  } else if (isOpenAi) {
    field<HTMLInputElement>("apiKey").placeholder = t.apiKeyPlaceholderOllama;
  } else {
    field<HTMLInputElement>("apiKey").placeholder = "";
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

// ---------- Annotations contestées (Q4) ----------

function currentLanguage(): string {
  return field<HTMLSelectElement>("language")?.value || "auto";
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = node("button", primary ? "primary" : "", text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/**
 * Formulaire de signalement : avertissement, adresse de la page facultative et
 * commentaire. Le ticket s'ouvre dans un onglet et l'utilisateur le publie lui-même.
 */
function reportForm(e: ContestedAnnotation, lang: string, onClose: () => void): HTMLElement {
  const t = getUiStrings(lang);
  const form = node("div", "report-form");
  form.append(node("p", "report-warning", t.reportWarning));
  const includeLabel = node("label", "");
  const include = document.createElement("input");
  include.type = "checkbox";
  include.checked = true;
  includeLabel.append(include, document.createTextNode(t.reportIncludeUrl));
  const commentLabel = node("label", "");
  commentLabel.style.flexDirection = "column";
  const comment = document.createElement("textarea");
  commentLabel.append(document.createTextNode(t.reportCommentLabel), comment);
  const actions = node("div", "contested-actions");
  actions.append(
    button(
      t.reportOpenBtn,
      () => {
        const url = issueUrl(e, { includeUrl: include.checked, comment: comment.value, extensionVersion: ext.runtime.getManifest().version });
        void ext.tabs.create({ url });
        void markReported(e.key).then(() => {
          onClose();
          void renderContested(lang);
        });
      },
      true,
    ),
    button(t.reportCancelBtn, onClose),
  );
  form.append(includeLabel, commentLabel, actions);
  return form;
}

function renderContestedItem(e: ContestedAnnotation, lang: string): HTMLLIElement {
  const t = getUiStrings(lang);
  const a = e.annotation;
  const li = node("li", "contested-item");

  const meta = node("p", "contested-meta");
  const link = document.createElement("a");
  link.href = e.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = e.pageTitle || e.url;
  const dates = [t.contestedOn(new Date(e.contestedAt).toLocaleString())];
  if (e.reportedAt) dates.push(t.contestedReportedOn(new Date(e.reportedAt).toLocaleString()));
  meta.append(link, document.createTextNode(` · ${dates.join(" · ")}`));

  const def = labelDef(a.category, a.label, lang);
  const head = node("p", "label", `${t.categories[a.category]} · ${def?.name ?? a.label} · ${t.severities[a.severity]}`);
  const quote = a.exact_quote ? node("blockquote", "quote", a.exact_quote) : node("p", "quote", t.contestedDocumentLevel);
  const critique = node("p", "critique", a.rhetoric_critique);

  const actions = node("div", "contested-actions");
  let form: HTMLElement | null = null;
  const report = button(t.contestedReportBtn, () => {
    if (form) return;
    form = reportForm(e, lang, () => {
      form?.remove();
      form = null;
    });
    li.append(form);
  });
  actions.append(report, button(t.contestedRemoveBtn, () => void removeContested(e.key)));
  li.append(meta, head, quote, critique, actions);
  return li;
}

async function renderContested(lang = currentLanguage()): Promise<void> {
  const t = getUiStrings(lang);
  const list = document.getElementById("contested-list");
  const empty = document.getElementById("contested-empty");
  if (!list || !empty) return;
  const entries = (await loadContested()).slice().reverse();
  empty.textContent = t.contestedEmpty;
  empty.hidden = entries.length > 0;
  list.replaceChildren(...entries.map((e) => renderContestedItem(e, lang)));
}

ext.storage.onChanged.addListener((changes, area) => {
  // Un formulaire de signalement ouvert n'est pas effacé par la date de signalement.
  if (area === "local" && changes[CONTESTED_KEY] && !document.querySelector("#contested-list .report-form")) void renderContested();
});

async function refreshTokensDisplay(lang?: string): Promise<void> {
  const currentLang = lang || field<HTMLSelectElement>("language")?.value || "fr";
  const stats = await loadTokenStats();
  const valPeriod = document.getElementById("val-tokens-period");
  const detailPeriod = document.getElementById("detail-tokens-period");
  const valAllTime = document.getElementById("val-tokens-alltime");
  const detailAllTime = document.getElementById("detail-tokens-alltime");
  const selectDay = document.getElementById("monthly-reset-day") as HTMLSelectElement | null;

  if (valPeriod) valPeriod.textContent = formatTokenCount(stats.periodTotalTokens, currentLang);
  if (detailPeriod) detailPeriod.textContent = `${formatTokenCount(stats.periodInputTokens, currentLang)} in · ${formatTokenCount(stats.periodOutputTokens, currentLang)} out`;
  if (valAllTime) valAllTime.textContent = formatTokenCount(stats.allTimeTotalTokens, currentLang);
  if (detailAllTime) detailAllTime.textContent = `${formatTokenCount(stats.allTimeInputTokens, currentLang)} in · ${formatTokenCount(stats.allTimeOutputTokens, currentLang)} out`;

  if (selectDay) {
    selectDay.value = String(stats.monthlyResetDay);
  }
}

const selectResetDay = document.getElementById("monthly-reset-day") as HTMLSelectElement | null;
if (selectResetDay) {
  selectResetDay.addEventListener("change", async () => {
    await setMonthlyResetDay(parseInt(selectResetDay.value, 10));
    await refreshTokensDisplay();
  });
}

const btnResetTokens = document.getElementById("btn-reset-tokens") as HTMLButtonElement | null;
if (btnResetTokens) {
  btnResetTokens.addEventListener("click", async () => {
    const lang = field<HTMLSelectElement>("language")?.value || "fr";
    const t = getUiStrings(lang);
    await resetTokenStats("period");
    await refreshTokensDisplay(lang);
    const status = document.getElementById("tokens-reset-status");
    if (status) {
      status.textContent = t.tokensResetSuccess;
      status.className = "saved";
      setTimeout(() => {
        if (status) status.textContent = "";
      }, 3000);
    }
  });
}

function switchTab(tab: "settings" | "tokens" | "guide"): void {
  const isSettings = tab === "settings";
  const isTokens = tab === "tokens";
  const isGuide = tab === "guide";

  const btnSettings = document.getElementById("tab-btn-settings");
  const btnTokens = document.getElementById("tab-btn-tokens");
  const btnGuide = document.getElementById("tab-btn-guide");

  const panelSettings = document.getElementById("panel-settings");
  const panelTokens = document.getElementById("panel-tokens");
  const panelGuide = document.getElementById("panel-guide");

  btnSettings?.classList.toggle("active", isSettings);
  btnSettings?.setAttribute("aria-selected", String(isSettings));
  btnTokens?.classList.toggle("active", isTokens);
  btnTokens?.setAttribute("aria-selected", String(isTokens));
  btnGuide?.classList.toggle("active", isGuide);
  btnGuide?.setAttribute("aria-selected", String(isGuide));

  if (panelSettings) panelSettings.hidden = !isSettings;
  if (panelTokens) {
    panelTokens.hidden = !isTokens;
    if (isTokens) void refreshTokensDisplay();
  }
  if (panelGuide) panelGuide.hidden = !isGuide;

  if (window.history.replaceState) {
    window.history.replaceState(null, "", `#${tab}`);
  }
}

document.getElementById("tab-btn-settings")?.addEventListener("click", () => switchTab("settings"));
document.getElementById("tab-btn-tokens")?.addEventListener("click", () => switchTab("tokens"));
document.getElementById("tab-btn-guide")?.addEventListener("click", () => switchTab("guide"));

if (window.location.hash === "#tokens") {
  switchTab("tokens");
} else if (window.location.hash === "#guide" || window.location.hash === "#about") {
  switchTab("guide");
}

void loadConfig().then(fillForm);

