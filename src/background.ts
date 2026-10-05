// Script de fond : ouvre le panneau au clic sur l'icône et pilote les analyses (D9).
// Chromium : API sidePanel. Firefox desktop : sidebarAction, à appeler pendant le
// geste utilisateur. Firefox Android : ni l'une ni l'autre, le clic sur l'icône lance
// directement l'analyse et le résultat s'affiche en bulles dans la page.

import { DEFAULT_CONFIG, isConfigured, loadConfig, providerOrigin, resolveLanguage, type Config } from "./config";
import { CROSSREF_ORIGIN } from "./crossref";
import { ext } from "./ext";
import { getUiStrings } from "./i18n";
import type { BackgroundToPanel, PanelToBackground, RunSnapshot } from "./messages";
import {
  cancelRun,
  contestRunAnnotation,
  forgetTab,
  getSnapshot,
  isRunning,
  loadCachedRun,
  runAnalysis,
  sendToTab,
  verifyRunAnnotation,
} from "./runner";
import { isDocumentLevel } from "./schema";
import { CATEGORIES, labelDef } from "./taxonomy";

interface FirefoxSidebarAction {
  toggle(): Promise<void>;
  open(): Promise<void>;
  close(): Promise<void>;
  isOpen(details?: { windowId?: number }): Promise<boolean>;
}

const sidebarAction = (globalThis as { browser?: { sidebarAction?: FirefoxSidebarAction } }).browser?.sidebarAction;

function updateActionBehavior(currentConfig: Config | null): void {
  const isInline = currentConfig?.displayMode === "inline";
  if (isInline) {
    ext.action.setPopup({ popup: "popup.html" }).catch(() => {});
    if (ext.sidePanel) {
      ext.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
    }
  } else {
    ext.action.setPopup({ popup: "" }).catch(() => {});
    if (ext.sidePanel) {
      ext.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  }
}

// Configuration gardée en mémoire : sur mobile, la demande de permission doit partir
// avant tout await, donc sans relire storage.local.
let config: Config | null = null;
void loadConfig().then((c) => {
  config = c;
  updateActionBehavior(c);
});
ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    void loadConfig().then((c) => {
      config = c;
      updateActionBehavior(c);
    });
  }
});

/**
 * État de l'onglet, rechargé depuis le cache s'il a été perdu : le service worker de
 * Chromium peut avoir été arrêté depuis l'analyse.
 */
async function ensureRun(tabId: number): Promise<void> {
  if (getSnapshot(tabId)) return;
  const tab = await ext.tabs.get(tabId).catch(() => null);
  await loadCachedRun(tabId, tab?.url);
}

/** Publie l'état vers le panneau ; sans panneau ouvert, l'envoi échoue sans conséquence. */
function broadcast(snapshot: RunSnapshot): void {
  const msg: BackgroundToPanel = { type: "run-update", snapshot };
  ext.runtime.sendMessage(msg).catch(() => {});
}

// Les messages des content scripts (annotation-clicked) sont destinés au panneau et
// ignorés ici : seuls les types de PanelToBackground sont traités.
ext.runtime.onMessage.addListener((msg: PanelToBackground, sender, sendResponse) => {
  switch (msg.type) {
    case "analyze-tab":
      void ext.tabs.get(msg.tabId).then((tab) => runAnalysis(msg.tabId, tab.url, { force: msg.force }, broadcast));
      sendResponse(null);
      break;
    case "analyze-youtube-chunk":
      void ext.tabs.get(msg.tabId).then((tab) =>
        runAnalysis(msg.tabId, tab.url, { force: Boolean(msg.force), youtubeChunkStartSec: msg.startSec }, broadcast),
      );
      sendResponse(null);
      break;
    case "analyze-youtube-full":
      void ext.tabs.get(msg.tabId).then((tab) =>
        runAnalysis(msg.tabId, tab.url, { force: Boolean(msg.force), youtubeFull: true }, broadcast),
      );
      sendResponse(null);
      break;
    case "cancel":
      cancelRun(msg.tabId);
      sendResponse(null);
      break;
    case "verify-annotation": {
      const tabId = msg.tabId ?? sender.tab?.id;
      if (tabId !== undefined) void ensureRun(tabId).then(() => verifyRunAnnotation(tabId, msg.id, broadcast));
      sendResponse(null);
      break;
    }
    case "contest-annotation": {
      const tabId = msg.tabId ?? sender.tab?.id;
      if (tabId !== undefined) void ensureRun(tabId).then(() => contestRunAnnotation(tabId, msg.id, msg.contested));
      sendResponse(null);
      break;
    }
    case "get-state":
      void (async () => {
        let snap = getSnapshot(msg.tabId);
        if (!snap) {
          const tab = await ext.tabs.get(msg.tabId).catch(() => null);
          snap = await loadCachedRun(msg.tabId, tab?.url);
        }
        sendResponse(snap);
      })();
      return true;
    case "open-sidepanel":
      if (sidebarAction) {
        void (async () => {
          const alreadyOpen = sidebarAction.isOpen ? await sidebarAction.isOpen().catch(() => false) : false;
          if (!alreadyOpen) {
            await sidebarAction.open().catch(() => sidebarAction.toggle().catch(() => {}));
          }
        })();
      } else if (ext.sidePanel) {
        const openChromeSidePanel = async () => {
          let winId = sender.tab?.windowId;
          if (winId === undefined && msg.tabId !== undefined) {
            const tab = await ext.tabs.get(msg.tabId).catch(() => null);
            winId = tab?.windowId;
          }
          if (winId === undefined) {
            const currentWin = await ext.windows.getCurrent().catch(() => null);
            winId = currentWin?.id;
          }
          if (winId !== undefined) {
            await ext.sidePanel.open({ windowId: winId }).catch(() => {});
          }
        };
        void openChromeSidePanel();
      }
      sendResponse(null);
      break;
    case "close-sidebar":
      if (sidebarAction) {
        sidebarAction.close().catch(() => {});
      }
      sendResponse(null);
      break;
  }
  return false;
});

ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") forgetTab(tabId);
});
ext.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

// ---------- Ouverture du panneau, ou analyse directe sur mobile ----------

if (ext.sidePanel) {
  ext.action.onClicked.addListener((tab) => {
    if (config?.displayMode !== "inline" && tab.windowId !== undefined) {
      ext.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
  });
} else if (sidebarAction) {
  ext.action.onClicked.addListener(() => {
    if (config?.displayMode !== "inline") {
      sidebarAction.toggle().catch(console.error);
    }
  });
} else {
  setupMobile();
}

function setupMobile(): void {
  ext.action.onClicked.addListener((tab) => {
    const tabId = tab.id;
    if (tabId === undefined) return;
    // Notice Crossref des études citées (D16) : seul hôte appelé en dehors du provider.
    const origins = [config ? providerOrigin(config) : null, CROSSREF_ORIGIN].filter((o): o is string => Boolean(o));
    const permission = ext.permissions.request({ origins });
    void (async () => {
      const current = config ?? (await loadConfig());
      const t = getUiStrings(current);
      if (!isConfigured(current)) {
        void ext.runtime.openOptionsPage();
        return;
      }
      if (isRunning(tabId)) return;
      const notify = mobileNotifier(tabId);
      if (!(await permission)) {
        notify({ ...emptySnapshot(tabId), status: "error", error: t.apiPermissionError });
        return;
      }
      await runAnalysis(tabId, tab.url, { force: false, displayMode: "inline" }, notify);
    })();
  });
}

function emptySnapshot(tabId: number): RunSnapshot {
  return { tabId, url: undefined, status: "error", phase: "extracting", done: 0, total: 0, summary: "", annotations: [], unlocated: [] };
}

/** Sans panneau, l'avancement et le résultat s'affichent dans un message bref de la page. */
function mobileNotifier(tabId: number): (s: RunSnapshot) => void {
  let last = "";
  return (s) => {
    const current = config ?? DEFAULT_CONFIG;
    const t = getUiStrings(current);
    let text: string;
    let isError = false;
    let durationMs = 0;
    if (s.status === "running") {
      if (s.retrying) text = t.retryingStatus;
      else if (s.phase === "extracting") text = t.extractingStatus;
      else if (s.phase === "consolidating") text = t.consolidatingStatus;
      else if (s.phase === "mapping") text = t.mappingStatus;
      else if (s.phase === "reviewing") text = t.reviewingStatus;
      else if (s.phase === "studies") text = t.studiesStatus;
      else text = s.total > 1 ? t.analyzingPartStatus(s.done, s.total) : t.analyzingStatus;
    } else if (s.status === "done") {
      durationMs = 5000;
      const passages = s.annotations.filter((a) => !isDocumentLevel(a));
      const overall = s.annotations.filter(isDocumentLevel);
      const counts = CATEGORIES.map((c) => [c, passages.filter((a) => a.category === c).length] as const).filter(([, n]) => n > 0);
      text = counts.length || overall.length ? counts.map(([c, n]) => `${t.categoriesPlural[c]} (${n})`).join(" · ") : t.emptyResults;
      if (s.skipped?.length) text += ` · ${t.partialShort(s.skipped.length)}`;
      // B3 : rappel des annotations d'ensemble ; si le titre n'a pas été trouvé dans la
      // page, le message bref est leur seul accès et reste affiché jusqu'au toucher.
      if (overall.length) {
        if (s.titleLocated) text += `${counts.length ? " · " : ""}${t.documentLevelShort(overall.length)}`;
        else {
          durationMs = 0;
          const lines = overall.map((a) => `${labelDef(a.category, a.label, resolveLanguage(current))?.name ?? a.label} : ${a.rhetoric_critique}`);
          text += `${counts.length ? "\n\n" : ""}${t.documentLevelHeading}\n${lines.join("\n")}`;
        }
      }
    } else if (s.status === "cancelled") {
      durationMs = 3000;
      text = t.cancelledStatus;
    } else {
      durationMs = 8000;
      isError = true;
      text = s.error ?? "";
    }
    if (text === last) return;
    last = text;
    sendToTab(tabId, { type: "toast", text, isError, durationMs }).catch(() => {});
  };
}
