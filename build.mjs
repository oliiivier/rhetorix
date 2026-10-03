// Build des deux cibles : dist/chrome (sidePanel, service worker) et
// dist/firefox (sidebar_action, script de fond). Usage : node build.mjs [--watch]

import * as esbuild from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

const entryPoints = {
  background: "src/background.ts",
  "content-script": "src/content-script.ts",
  sidepanel: "src/sidepanel/sidepanel.ts",
  options: "src/options/options.ts",
};

const staticFiles = {
  "sidepanel.html": "src/sidepanel/sidepanel.html",
  "options.html": "src/options/options.html",
  "ui.css": "src/ui.css",
  "highlights.css": "src/highlights.css",
  "icons/icon-16.png": "src/icons/icon-16.png",
  "icons/icon-32.png": "src/icons/icon-32.png",
  "icons/icon-48.png": "src/icons/icon-48.png",
  "icons/icon-128.png": "src/icons/icon-128.png",
  "icons/icon.svg": "src/icons/icon.svg",
};

const iconPaths = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
};

const baseManifest = {
  manifest_version: 3,
  name: "Rhetorix",
  version: pkg.version,
  description: "Surligne sophismes, biais et allégations factuelles d'un article et les détaille dans un panneau latéral.",
  icons: iconPaths,
  permissions: ["activeTab", "scripting", "storage"],
  // Permissions d'hôte pour l'analyse des articles et l'accès aux API LLM et endpoints locaux
  host_permissions: ["https://*/*", "http://*/*", "http://localhost/*", "http://127.0.0.1/*"],
  action: {
    default_title: "Rhetorix",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
    },
  },
  options_ui: { page: "options.html", open_in_tab: true },
};

const targets = {
  chrome: {
    esbuildTarget: "chrome128",
    manifest: {
      ...baseManifest,
      minimum_chrome_version: "128",
      permissions: [...baseManifest.permissions, "sidePanel"],
      side_panel: { default_path: "sidepanel.html" },
      background: { service_worker: "background.js" },
    },
  },
  firefox: {
    esbuildTarget: "firefox140",
    manifest: {
      ...baseManifest,
      sidebar_action: {
        default_panel: "sidepanel.html",
        default_title: "Rhetorix",
        default_icon: {
          "16": "icons/icon-16.png",
          "32": "icons/icon-32.png",
          "48": "icons/icon-48.png",
        },
        open_at_install: false,
      },
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          // Identifiant provisoire : à remplacer avant publication sur addons.mozilla.org.
          id: "rhetorix@rhetorix.local",
          // 142 : requis par data_collection_permissions (la CSS Custom Highlight API est supportée dès 140).
          strict_min_version: "142.0",
          data_collection_permissions: { required: ["websiteContent"] },
        },
        // Firefox pour Android (D9) : pas de barre latérale, l'icône lance l'analyse.
        gecko_android: { strict_min_version: "142.0" },
      },
    },
  },
};

async function writeStatic(name, target) {
  const outdir = `dist/${name}`;
  await mkdir(outdir, { recursive: true });
  await mkdir(`${outdir}/icons`, { recursive: true });
  await Promise.all(Object.entries(staticFiles).map(([dest, src]) => copyFile(src, `${outdir}/${dest}`)));
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(target.manifest, null, 2) + "\n");
}

await rm("dist", { recursive: true, force: true });

for (const [name, target] of Object.entries(targets)) {
  const ctx = await esbuild.context({
    entryPoints,
    outdir: `dist/${name}`,
    bundle: true,
    format: "iife",
    target: target.esbuildTarget,
    sourcemap: watch ? "inline" : false,
    legalComments: "linked",
    logLevel: "info",
    plugins: [{ name: "static", setup: (b) => b.onEnd(() => writeStatic(name, target)) }],
  });
  if (watch) await ctx.watch();
  else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}
