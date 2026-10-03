// Script de fond : ouvre le panneau au clic sur l'icône.
// Chromium : API sidePanel. Firefox : sidebarAction, à appeler pendant le geste utilisateur.

import { ext } from "./ext";

interface FirefoxSidebarAction {
  toggle(): Promise<void>;
}

const sidebarAction = (globalThis as { browser?: { sidebarAction?: FirefoxSidebarAction } }).browser?.sidebarAction;

if (ext.sidePanel) {
  ext.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else if (sidebarAction) {
  ext.action.onClicked.addListener(() => {
    sidebarAction.toggle().catch(console.error);
  });
}
