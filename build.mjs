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
};

const baseManifest = {
  manifest_version: 3,
  name: "Rhetorix",
  version: pkg.version,
  description: "Surligne sophismes, biais et allégations factuelles d'un article et les détaille dans un panneau latéral.",
  permissions: ["activeTab", "scripting", "storage"],
  // Accès à l'API du fournisseur LLM, demandé depuis les options selon l'endpoint choisi.
  optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
  action: { default_title: "Rhetorix" },
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
      sidebar_action: { default_panel: "sidepanel.html", default_title: "Rhetorix", open_at_install: false },
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          // Identifiant provisoire : à remplacer avant publication sur addons.mozilla.org.
          id: "rhetorix@rhetorix.local",
          // 140 : première version avec la CSS Custom Highlight API.
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["websiteContent"] },
        },
      },
    },
  },
};

async function writeStatic(name, target) {
  const outdir = `dist/${name}`;
  await mkdir(outdir, { recursive: true });
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
