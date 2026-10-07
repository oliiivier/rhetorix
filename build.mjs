// Build des deux cibles : dist/chrome (sidePanel, service worker) et
// dist/firefox (sidebar_action, script de fond). Usage : node build.mjs [--watch]

import * as esbuild from "esbuild";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

const entryPoints = {
  background: "src/background.ts",
  "content-script": "src/content-script.ts",
  "content-script-youtube": "src/content-script-youtube.ts",
  sidepanel: "src/sidepanel/sidepanel.ts",
  options: "src/options/options.ts",
  popup: "src/popup/popup.ts",
};

const staticFiles = {
  "sidepanel.html": "src/sidepanel/sidepanel.html",
  "options.html": "src/options/options.html",
  "popup.html": "src/popup/popup.html",
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
  // Accès aux sites demandé à l'exécution (permissions.request), jamais accordé à
  // l'installation : injection dans l'onglet analysé quand activeTab ne suffit pas, API
  // du provider (endpoints locaux compris), Crossref et PubMed. Moindre privilège.
  optional_host_permissions: ["https://*/*", "http://*/*"],
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
          // Identifiant définitif sur addons.mozilla.org : ne plus le modifier après publication.
          id: "{41b53149-86da-4be6-ad0c-165f373b6236}",
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

/** Paquets npm effectivement embarqués, d'après le metafile d'esbuild. */
function bundledPackages(metafile) {
  const names = new Set();
  for (const input of Object.keys(metafile?.inputs ?? {})) {
    const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** Licences des dépendances embarquées, exigées pour leur redistribution (MIT, Apache 2.0…). */
async function thirdPartyLicenses(metafile) {
  const sections = [];
  for (const pkg of bundledPackages(metafile)) {
    const dir = `node_modules/${pkg}`;
    const { version, license } = JSON.parse(await readFile(`${dir}/package.json`, "utf8"));
    const file = (await readdir(dir)).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const text = file ? (await readFile(`${dir}/${file}`, "utf8")).trim() : `Licence : ${license} (aucun fichier de licence fourni par le paquet).`;
    sections.push(`${pkg} ${version} (${license})\n${"=".repeat(72)}\n\n${text}\n`);
  }
  return `Licences des bibliothèques tierces embarquées dans Rhetorix.\n\n${sections.join("\n\n")}`;
}

async function writeStatic(name, target, metafile) {
  const outdir = `dist/${name}`;
  await mkdir(outdir, { recursive: true });
  await mkdir(`${outdir}/icons`, { recursive: true });
  await Promise.all(Object.entries(staticFiles).map(([dest, src]) => copyFile(src, `${outdir}/${dest}`)));
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(target.manifest, null, 2) + "\n");
  await copyFile("LICENSE", `${outdir}/LICENSE`);
  await writeFile(`${outdir}/THIRD_PARTY_LICENSES.txt`, await thirdPartyLicenses(metafile));
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
    metafile: true,
    logLevel: "info",
    plugins: [{ name: "static", setup: (b) => b.onEnd((result) => writeStatic(name, target, result.metafile)) }],
  });
  if (watch) await ctx.watch();
  else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}
