// Espace de noms des API WebExtension : `browser` (Firefox, promesses natives)
// ou `chrome` (Chromium, promesses en MV3). Les API utilisées ont la même forme.
// Lu sur globalThis pour que les modules restent importables hors navigateur (tests).
const g = globalThis as { browser?: typeof chrome; chrome?: typeof chrome };
export const ext = (g.browser ?? g.chrome) as typeof chrome;
