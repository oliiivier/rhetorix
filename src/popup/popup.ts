// Popover de l'icône d'extension : permet de lancer l'analyse en mode bulles au survol,
// d'ajuster le mode d'affichage et d'accéder aux paramètres sans ouvrir le panneau latéral.

import { isConfigured, loadConfig, providerOrigin, saveConfig, type Config, type DisplayMode } from "../config";
import { ext } from "../ext";
import { getUiStrings } from "../i18n";
import type { BackgroundToPanel, PanelToBackground, RunSnapshot } from "../messages";
import { CATEGORIES } from "../taxonomy";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const analyzeBtn = $<HTMLButtonElement>("analyze");
const cancelBtn = $<HTMLButtonElement>("cancel");
const modeSelect = $<HTMLSelectElement>("display-mode");
const statusEl = $<HTMLParagraphElement>("status");
const optionsBtn = $<HTMLButtonElement>("options");
const modeLabel = $<HTMLLabelElement>("mode-label");
const resultsSummary = $<HTMLDivElement>("results-summary");
const badgesEl = $<HTMLDivElement>("badges");

let config: Config | null = null;
let currentTabId: number | undefined;
let currentTabUrl: string | undefined;

function strings() {
  return getUiStrings(config ?? undefined);
}

function applyI18n(): void {
  const t = strings();
  modeLabel.textContent = t.displayModeLabel;
  optionsBtn.title = t.optionsBtnTitle;
  optionsBtn.setAttribute("aria-label", t.optionsBtnTitle);
  cancelBtn.textContent = t.cancelBtn;
  const optBoth = $("opt-both");
  if (optBoth) optBoth.textContent = t.displayModes.both;
  const optInline = $("opt-inline");
  if (optInline) optInline.textContent = t.displayModes.inline;
  const optSidepanel = $("opt-sidepanel");
  if (optSidepanel) optSidepanel.textContent = t.displayModes.sidepanel;
}

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
  statusEl.hidden = !text;
}

function setRunningUi(running: boolean): void {
  analyzeBtn.disabled = running;
  cancelBtn.hidden = !running;
}

function statusText(s: RunSnapshot): string {
  const t = strings();
  if (s.phase === "extracting") return t.extractingStatus;
  if (s.phase === "consolidating") return t.consolidatingStatus;
  return s.total > 1 ? t.analyzingPartStatus(s.done, s.total) : t.analyzingStatus;
}

function renderSnapshot(s: RunSnapshot | null): void {
  const t = strings();
  if (!s || s.status === "error" || s.status === "cancelled") {
    setRunningUi(false);
    resultsSummary.hidden = true;
    badgesEl.replaceChildren();
    if (s?.status === "cancelled") {
      setStatus(t.cancelledStatus);
    } else if (s?.error) {
      setStatus(s.error, true);
    } else {
      setStatus(t.idleStatus);
    }
    analyzeBtn.textContent = t.analyzeBtn;
    return;
  }

  if (s.status === "running") {
    setRunningUi(true);
    setStatus(statusText(s));
    resultsSummary.hidden = true;
    return;
  }

  if (s.status === "done") {
    setRunningUi(false);
    analyzeBtn.textContent = t.reanalyzeBtn;
    resultsSummary.hidden = false;
    badgesEl.replaceChildren();

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

async function init(): Promise<void> {
  config = await loadConfig();
  applyI18n();
  modeSelect.value = config.displayMode;

  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  currentTabId = tab.id;
  currentTabUrl = tab.url;

  if (!isAnalyzableUrl(tab.url)) {
    analyzeBtn.disabled = true;
    setStatus(strings().internalPageNotice);
    return;
  }

  const snapshot = await sendToBackground<RunSnapshot | null>({ type: "get-state", tabId: tab.id }).catch(() => null);
  renderSnapshot(snapshot);
}

analyzeBtn.addEventListener("click", () => {
  const isDone = analyzeBtn.textContent === strings().reanalyzeBtn;
  void analyze(isDone);
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

modeSelect.addEventListener("change", async () => {
  if (!config) return;
  const newMode = modeSelect.value as DisplayMode;
  config = { ...config, displayMode: newMode };
  await saveConfig(config);

  if (currentTabId !== undefined) {
    void ext.tabs.sendMessage(currentTabId, { type: "set-display-mode", displayMode: newMode }).catch(() => {});
  }

  if (newMode !== "inline") {
    // L'utilisateur quitte le mode bulles seules : on ouvre le panneau latéral et on ferme le popup
    await sendToBackground({ type: "open-sidepanel", tabId: currentTabId });
    window.close();
  }
});

ext.runtime.onMessage.addListener((msg: BackgroundToPanel) => {
  if (msg.type === "run-update" && msg.snapshot.tabId === currentTabId) {
    renderSnapshot(msg.snapshot);
  }
  return false;
});

void init();
