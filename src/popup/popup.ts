// Popover moderne de l'icône d'extension (style card compact, inspiré de Proton Pass).
// Permet de piloter l'analyse, de visualiser l'état de la page active,
// de consulter le résumé et de basculer de mode sans encombrer la page.

import { isConfigured, loadConfig, providerOrigin, saveConfig, type Config, type DisplayMode } from "../config";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";
import type { BackgroundToPanel, PanelToBackground, RunSnapshot } from "../messages";
import { CATEGORIES } from "../taxonomy";
import { isYouTubeWatchUrl } from "../youtube/youtube-detector";
import { formatTokenCount, type TokenUsage } from "../tokens";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const brandSubtitleEl = $<HTMLSpanElement>("brand-subtitle");
const optionsBtn = $<HTMLButtonElement>("options");
const pageHostEl = $<HTMLDivElement>("page-host");
const pageTitleEl = $<HTMLDivElement>("page-title");
const analyzeBtn = $<HTMLButtonElement>("analyze");
const analyzeIcon = $<HTMLSpanElement>("analyze-icon");
const analyzeText = $<HTMLSpanElement>("analyze-text");
const cancelBtn = $<HTMLButtonElement>("cancel");
const statusContainer = $<HTMLDivElement>("status-container");
const spinner = $<HTMLDivElement>("spinner");
const statusEl = $<HTMLParagraphElement>("status");
const resultsCard = $<HTMLElement>("results-card");
const resultsHeading = $<HTMLSpanElement>("results-heading");
const resultsSummary = $<HTMLDivElement>("results-summary");
const resultsExtras = $<HTMLDivElement>("results-extras");
const badgesEl = $<HTMLDivElement>("badges");
const openPanelBtn = $<HTMLButtonElement>("open-panel-btn");
const openPanelText = $<HTMLSpanElement>("open-panel-text");
const modeLabel = $<HTMLLabelElement>("mode-label");
const modeSelect = $<HTMLSelectElement>("display-mode");
const modeTip = $<HTMLParagraphElement>("mode-tip");

let config: Config | null = null;
let currentTabId: number | undefined;
let currentTabUrl: string | undefined;
let isAnalysisDone = false;

function strings() {
  return getUiStrings(config ?? undefined);
}

function applyI18n(): void {
  const t = strings();
  brandSubtitleEl.textContent = t.brandSubtitle;
  optionsBtn.title = t.optionsBtnTitle;
  optionsBtn.setAttribute("aria-label", t.optionsBtnTitle);
  cancelBtn.textContent = t.cancelBtn;
  openPanelText.textContent = t.openPanelDetails;
  resultsHeading.textContent = t.analysisResultsHeading;
  modeLabel.textContent = t.displayModeLabel;
  modeTip.textContent = t.inlineModeTip;

  const optBoth = $("opt-both");
  if (optBoth) optBoth.textContent = t.displayModes.both;
  const optInline = $("opt-inline");
  if (optInline) optInline.textContent = t.displayModes.inline;
  const optSidepanel = $("opt-sidepanel");
  if (optSidepanel) optSidepanel.textContent = t.displayModes.sidepanel;

  updateAnalyzeButtonLabel(false);
}

function updateAnalyzeButtonLabel(running: boolean): void {
  const t = strings();
  const isYouTube = Boolean(currentTabUrl && isYouTubeWatchUrl(currentTabUrl));
  if (running) {
    analyzeIcon.textContent = isYouTube ? "⏳" : "⟳";
    analyzeText.textContent = t.analyzingStatus;
  } else if (isAnalysisDone) {
    analyzeIcon.textContent = "🔄";
    analyzeText.textContent = t.reanalyzeBtn;
  } else {
    analyzeIcon.textContent = "⚡";
    analyzeText.textContent = isYouTube ? t.youtubeAnalyzeChunkBtn : t.analyzeBtn;
  }
}

function setStatus(text: string, isError = false): void {
  if (!text) {
    statusContainer.hidden = true;
    statusEl.textContent = "";
    statusEl.classList.remove("error");
    return;
  }
  statusContainer.hidden = false;
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function setRunningUi(running: boolean): void {
  analyzeBtn.disabled = running;
  cancelBtn.hidden = !running;
  spinner.hidden = !running;
  updateAnalyzeButtonLabel(running);
  if (running) {
    statusContainer.hidden = false;
  }
}

function statusText(s: RunSnapshot): string {
  const t = strings();
  if (s.retrying) return t.retryingStatus;
  if (s.phase === "extracting") return t.extractingStatus;
  if (s.phase === "consolidating") return t.consolidatingStatus;
  if (s.phase === "mapping") return t.mappingStatus;
  if (s.phase === "reviewing") return t.reviewingStatus;
  return s.total > 1 ? t.analyzingPartStatus(s.done, s.total) : t.analyzingStatus;
}

function renderSnapshot(s: RunSnapshot | null): void {
  const t = strings();
  if (!s || s.status === "error" || s.status === "cancelled") {
    isAnalysisDone = false;
    setRunningUi(false);
    resultsCard.hidden = true;
    badgesEl.replaceChildren();
    resultsSummary.replaceChildren();
    resultsExtras.replaceChildren();

    if (s?.status === "cancelled") {
      setStatus(t.cancelledStatus);
    } else if (s?.error) {
      setStatus(s.error, true);
    } else {
      setStatus("");
    }
    return;
  }

  if (s.status === "running") {
    isAnalysisDone = false;
    setRunningUi(true);
    setStatus(statusText(s));
    resultsCard.hidden = true;
    return;
  }

  if (s.status === "done") {
    isAnalysisDone = true;
    setRunningUi(false);
    resultsCard.hidden = false;
    badgesEl.replaceChildren();
    resultsSummary.replaceChildren();
    resultsExtras.replaceChildren();

    // Résumé global / posture
    if (s.summary) {
      resultsSummary.hidden = false;
      resultsSummary.textContent = s.summary;
    } else {
      resultsSummary.hidden = true;
    }

    // Signaux complémentaires : clickbait et angle mort
    let hasExtras = false;
    if (s.clickbaitGap) {
      hasExtras = true;
      const chip = document.createElement("div");
      chip.className = "results-extra-item clickbait";
      chip.textContent = `⚠️ ${t.clickbaitHeading} : ${s.clickbaitGap}`;
      resultsExtras.append(chip);
    }
    if (s.blindSpot) {
      hasExtras = true;
      const chip = document.createElement("div");
      chip.className = "results-extra-item blind-spot";
      chip.textContent = `👁️ ${t.blindSpotHeading} : ${s.blindSpot}`;
      resultsExtras.append(chip);
    }
    if (s.skipped?.length) {
      hasExtras = true;
      const chip = document.createElement("div");
      chip.className = "results-extra-item clickbait";
      chip.textContent = `⚠️ ${t.partialShort(s.skipped.length)}`;
      resultsExtras.append(chip);
    }
    resultsExtras.hidden = !hasExtras;

    // Badges par catégorie
    const counts = {
      sophism: s.annotations.filter((a) => a.category === "sophism").length,
      bias: s.annotations.filter((a) => a.category === "bias").length,
      factual_claim: s.annotations.filter((a) => a.category === "factual_claim").length,
    };

    if (s.annotations.length === 0) {
      setStatus(t.emptyResults);
    } else {
      setStatus("");
      for (const cat of CATEGORIES) {
        if (counts[cat] > 0) {
          const span = document.createElement("span");
          span.className = `badge ${cat}`;
          span.textContent = `${t.categoriesPlural[cat]} (${counts[cat]})`;
          badgesEl.append(span);
        }
      }
    }
    renderTokenUsage(s.usage, Boolean(s.cachedAt));
  }
}

function renderTokenUsage(usage: TokenUsage | undefined, isCached = false): void {
  const bar = $("popup-token-bar");
  if (!bar) return;
  const t = strings();
  const lang = config ? config.language : "fr";

  if (!usage || (usage.totalTokens === 0 && !isCached)) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  const lbl = $("popup-token-label");
  if (lbl) lbl.textContent = t.tokenUsageLabel;

  const inEl = $("popup-token-in");
  const dotEl = $("popup-token-dot");
  const outEl = $("popup-token-out");
  const totalEl = $("popup-token-total");
  const cachedEl = $("popup-token-cached");

  if (isCached && usage.totalTokens === 0) {
    if (inEl) inEl.textContent = "";
    if (dotEl) dotEl.hidden = true;
    if (outEl) outEl.textContent = "";
    if (totalEl) totalEl.textContent = "";
    if (cachedEl) {
      cachedEl.textContent = t.tokenCached;
      cachedEl.hidden = false;
    }
  } else {
    if (dotEl) dotEl.hidden = false;
    if (inEl) inEl.textContent = t.tokenIn(formatTokenCount(usage.inputTokens, lang));
    if (outEl) outEl.textContent = t.tokenOut(formatTokenCount(usage.outputTokens, lang));
    if (totalEl) totalEl.textContent = t.tokenTotal(formatTokenCount(usage.totalTokens, lang));
    if (cachedEl) cachedEl.hidden = true;
  }
}

async function sendToBackground<R>(msg: PanelToBackground): Promise<R> {
  return ext.runtime.sendMessage(msg) as Promise<R>;
}

function isAnalyzableUrl(url?: string): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

async function analyze(force: boolean): Promise<void> {
  const t = strings();
  if (!config || !isConfigured(config)) {
    setStatus(t.needConfigStatus, true);
    void ext.runtime.openOptionsPage();
    return;
  }
  if (!currentTabId || !isAnalyzableUrl(currentTabUrl)) {
    setStatus(t.internalPageNotice, true);
    return;
  }

  const origins = ["https://*/*", "http://*/*"];
  const origin = providerOrigin(config);
  if (origin && !origins.includes(origin)) {
    origins.push(origin);
  }
  const granted = await ext.permissions.request({ origins }).catch(() => false);
  if (!granted) {
    setStatus(t.apiPermissionError, true);
    return;
  }

  setRunningUi(true);
  setStatus(t.extractingStatus);
  await sendToBackground({ type: "analyze-tab", tabId: currentTabId, force });
}

function triggerOpenSidebar(): void {
  // En Firefox, sidebarAction.open() requiert impérativement d'être appelé de façon
  // synchrone au tout début du gestionnaire d'événement (contexte de geste utilisateur).
  const ffSidebar = (globalThis as { browser?: { sidebarAction?: { open(): Promise<void> } } }).browser?.sidebarAction;
  if (ffSidebar?.open) {
    ffSidebar.open().catch((err) => {
      console.warn("ffSidebar.open() fallback:", err);
      void sendToBackground({ type: "open-sidepanel", tabId: currentTabId });
    });
  } else {
    void sendToBackground({ type: "open-sidepanel", tabId: currentTabId });
  }
}

async function init(): Promise<void> {
  config = await loadConfig();
  applyI18n();
  modeSelect.value = config.displayMode;

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  currentTabId = tab.id;
  currentTabUrl = tab.url;
  updateAnalyzeButtonLabel(false);

  if (tab.url) {
    try {
      const u = new URL(tab.url);
      pageHostEl.textContent = u.hostname || tab.url;
    } catch {
      pageHostEl.textContent = tab.url;
    }
  }
  pageTitleEl.textContent = tab.title || "";

  if (!isAnalyzableUrl(tab.url)) {
    analyzeBtn.disabled = true;
    setStatus(strings().internalPageNotice);
    return;
  }

  const snapshot = await sendToBackground<RunSnapshot | null>({ type: "get-state", tabId: tab.id }).catch(() => null);
  renderSnapshot(snapshot);
}

analyzeBtn.addEventListener("click", () => {
  void analyze(isAnalysisDone);
});

cancelBtn.addEventListener("click", () => {
  if (currentTabId !== undefined) {
    void sendToBackground({ type: "cancel", tabId: currentTabId });
  }
});

optionsBtn.addEventListener("click", () => {
  void ext.runtime.openOptionsPage();
  window.close();
});

openPanelBtn.addEventListener("click", () => {
  // 1. Déclenchement synchrone immédiat pour garantir le geste utilisateur
  triggerOpenSidebar();

  // 2. Bascule automatique dans le mode "Bulles & panneau à la demande" si on était en bulles seules
  void (async () => {
    if (config?.displayMode === "inline") {
      config = { ...config, displayMode: "both" };
      await saveConfig(config);
      if (currentTabId !== undefined) {
        void ext.tabs.sendMessage(currentTabId, { type: "set-display-mode", displayMode: "both" }).catch(() => {});
      }
    }
    setTimeout(() => window.close(), 150);
  })();
});

modeSelect.addEventListener("change", () => {
  if (!config) return;
  const newMode = modeSelect.value as DisplayMode;
  config = { ...config, displayMode: newMode };

  if (newMode !== "inline") {
    triggerOpenSidebar();
  }

  void (async () => {
    await saveConfig(config!);
    if (currentTabId !== undefined) {
      void ext.tabs.sendMessage(currentTabId, { type: "set-display-mode", displayMode: newMode }).catch(() => {});
    }
    if (newMode !== "inline") {
      setTimeout(() => window.close(), 150);
    }
  })();
});

ext.runtime.onMessage.addListener((msg: BackgroundToPanel) => {
  if (msg.type === "run-update" && msg.snapshot.tabId === currentTabId) {
    renderSnapshot(msg.snapshot);
  }
  return false;
});

void init();
