#!/usr/bin/env node
// Évaluation du moteur d'analyse sur le corpus (piste Q1, eval/corpus/README.md).
// Lance le moteur réel (src/analyze.ts) sur chaque fiche et mesure rappel par
// catégorie, précision, statut factuel, éléments globaux, citations localisées,
// stabilité et neutralité. Appelle un vrai provider : non exécuté par `npm test`.
//
//   npm run corpus:eval -- -p anthropic [--depth deep] [--runs 3] [--only id,id] [--out res.json]

import esbuild from "esbuild";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = path.join(ROOT, "eval", "corpus");

const HELP = `Évaluation du moteur sur le corpus (eval/corpus)

  npm run corpus:eval -- [options]

  -p, --provider <id>    anthropic, gemini ou openai-compatible (défaut : selon les variables d'environnement)
  -m, --model <nom>      modèle (défaut : celui de l'extension)
  -k, --key <clé>        clé API (sinon ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY)
  -e, --endpoint <url>   endpoint compatible OpenAI (sinon OPENAI_ENDPOINT ou OLLAMA_ENDPOINT)
  -l, --lang <code>      langue des explications (défaut : fr)
  --depth <mode>         fast ou deep (réglage « Analyse : rapide / approfondie », D10)
  --no-web-search        sans recherche web (statuts factuels « unverified »)
  --runs <n>             exécutions par article, pour mesurer la stabilité (défaut : 1)
  --only <id,id>         limiter aux fiches citées
  --out <fichier.json>   enregistrer les analyses et les scores, pour relecture
  -v, --verbose          détailler les écarts de chaque article
`;

function parseArgs(argv) {
  const o = { provider: null, model: null, key: null, endpoint: null, lang: "fr", depth: "fast", webSearch: true, runs: 1, only: null, out: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "-p" || a === "--provider") o.provider = next();
    else if (a === "-m" || a === "--model") o.model = next();
    else if (a === "-k" || a === "--key") o.key = next();
    else if (a === "-e" || a === "--endpoint") o.endpoint = next();
    else if (a === "-l" || a === "--lang") o.lang = next();
    else if (a === "--depth") o.depth = next();
    else if (a === "--no-web-search") o.webSearch = false;
    else if (a === "--runs") o.runs = Math.max(1, Number(next()) || 1);
    else if (a === "--only") o.only = new Set(next().split(","));
    else if (a === "--out") o.out = next();
    else if (a === "-v" || a === "--verbose") o.verbose = true;
    else throw new Error(`Option inconnue : ${a}`);
  }
  return o;
}

async function bundleEngine() {
  const outfile = path.join(ROOT, "node_modules", ".cache", "rhetorix-corpus-eval.mjs");
  await esbuild.build({
    stdin: {
      contents: `export { analyzeArticle } from "./src/analyze";
export { DEFAULT_CONFIG, DEFAULT_MODELS } from "./src/config";
export * from "./eval/score";`,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    outfile,
    external: ["@anthropic-ai/sdk"],
    logLevel: "error",
  });
  return outfile;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)} %` : "—");

/** Texte de la fiche : versionné s'il est libre, local sinon ; ignoré s'il a changé. */
async function loadText(article) {
  const dir = article.license.redistributable ? "texts" : ".local";
  const file = path.join(CORPUS, dir, `${article.id}.txt`);
  if (!existsSync(file)) return { skip: `texte absent (${dir}/), lancer npm run corpus:fetch` };
  const text = (await fs.readFile(file, "utf8")).trim();
  if (article.text_sha256 && sha256(text) !== article.text_sha256) return { skip: "texte modifié depuis l'annotation (empreinte différente)" };
  return { text };
}

function resolveProvider(o) {
  const env = process.env;
  const provider =
    o.provider ??
    (env.ANTHROPIC_API_KEY ? "anthropic" : env.GEMINI_API_KEY ? "gemini" : env.OPENAI_API_KEY || env.OPENAI_ENDPOINT || env.OLLAMA_ENDPOINT ? "openai-compatible" : null);
  if (!provider) throw new Error("Aucun provider : préciser -p ou définir une clé API dans l'environnement.");
  if (provider === "chrome-ai") throw new Error("Gemini Nano (chrome-ai) n'est disponible que dans le navigateur.");
  const key =
    o.key ?? (provider === "anthropic" ? env.ANTHROPIC_API_KEY : provider === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY) ?? "";
  const endpoint = o.endpoint ?? (provider === "openai-compatible" ? env.OPENAI_ENDPOINT ?? env.OLLAMA_ENDPOINT ?? "" : "");
  return { provider, key, endpoint };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return console.log(HELP);
  const { provider, key, endpoint } = resolveProvider(o);

  // Environnement WebExtension minimal : langue de l'interface, stockage inutilisé.
  globalThis.chrome = { i18n: { getUILanguage: () => o.lang }, storage: { local: { get: async () => ({}), set: async () => {} } } };
  const engine = await import(pathToFileURL(await bundleEngine()).href);
  const model = o.model ?? engine.DEFAULT_MODELS[provider];
  if (!model) throw new Error("Préciser le modèle avec -m.");

  const files = (await fs.readdir(path.join(CORPUS, "articles"))).filter((f) => f.endsWith(".json")).sort();
  const articles = [];
  for (const f of files) articles.push(JSON.parse(await fs.readFile(path.join(CORPUS, "articles", f), "utf8")));
  const selected = articles.filter((a) => !o.only || o.only.has(a.id));

  console.log(`Provider ${provider}, modèle ${model}, mode ${o.depth}, recherche web ${o.webSearch ? "activée" : "désactivée"}, ${o.runs} exécution(s) par article\n`);

  const scores = [];
  const report = [];
  for (const article of selected) {
    const { text, skip } = await loadText(article);
    if (skip) {
      console.log(`- ${article.id} : ignoré, ${skip}`);
      continue;
    }
    const config = {
      ...engine.DEFAULT_CONFIG,
      provider,
      apiKey: key,
      model,
      endpoint,
      language: o.lang,
      webSearch: o.webSearch,
      analysisDepth: o.depth,
      maxChunkTokens: article.eval?.max_chunk_tokens ?? engine.DEFAULT_CONFIG.maxChunkTokens,
    };
    const extracted = { title: article.title, lang: article.lang, paragraphs: text.split("\n\n"), publishedTime: article.source?.published };
    const runs = [];
    for (let r = 0; r < o.runs; r++) {
      const started = Date.now();
      let usage;
      try {
        const analysis = await engine.analyzeArticle(extracted, config, new AbortController().signal, { onUsage: (u) => (usage = u) });
        const score = engine.scoreArticle(article, analysis, text);
        runs.push(score);
        scores.push(score);
        report.push({ id: article.id, run: r + 1, ms: Date.now() - started, usage, analysis, score });
      } catch (err) {
        console.log(`- ${article.id} (exécution ${r + 1}) : échec, ${err.message}`);
        report.push({ id: article.id, run: r + 1, error: String(err.message ?? err) });
      }
    }
    if (runs.length === 0) continue;
    const last = runs.at(-1);
    const req = Object.values(last.byCategory).reduce((n, c) => n + c.required, 0);
    const found = Object.values(last.byCategory).reduce((n, c) => n + c.found, 0);
    const st = engine.stability(runs);
    console.log(
      `- ${article.id} : rappel ${found}/${req}, ${last.produced} annotation(s) dont ${last.produced - last.matched} hors attentes` +
        (last.overall ? `, ${last.overall} sur l'ensemble` : "") +
        (st === null ? "" : `, stabilité ${pct(st * 100, 100)}`) +
        (last.issues.length ? `, ${last.issues.length} écart(s)` : ""),
    );
    if (o.verbose) for (const i of last.issues) console.log(`    [${i.kind}] ${i.message}`);
  }

  if (scores.length === 0) return console.log("\nAucun article évalué.");
  const s = engine.summarize(scores, articles);
  console.log(`\nSynthèse sur ${s.articles} article(s), ${s.runs} exécution(s)`);
  for (const [c, v] of Object.entries(s.byCategory)) if (v.required) console.log(`  rappel ${c.padEnd(14)} ${pct(v.found, v.required)} (${v.found}/${v.required})`);
  console.log(`  précision          ${pct(s.matched, s.produced)} (${s.matched}/${s.produced} annotations dans les attentes)`);
  console.log(`  citations trouvées ${pct(s.located, s.produced)}`);
  console.log(`  sur l'ensemble     ${s.overall} annotation(s) sans citation (B3), à relire`);
  console.log(`  statut factuel     ${pct(s.factCorrect, s.factChecked)} (${s.factCorrect}/${s.factChecked})`);
  console.log(`  éléments globaux   ${pct(s.documentCorrect, s.documentChecks)} (${s.documentCorrect}/${s.documentChecks})`);
  console.log(`  témoins            ${s.controlRhetorical.toFixed(1)} annotation(s) rhétorique(s) en moyenne`);

  // Neutralité : articles symétriques d'une même paire.
  const pairs = new Map();
  for (const a of articles.filter((x) => x.pair)) pairs.set(a.pair, [...(pairs.get(a.pair) ?? []), a]);
  for (const [pair, members] of pairs) {
    const rows = members
      .map((a) => {
        const rs = scores.filter((x) => x.id === a.id);
        if (!rs.length) return null;
        const avg = (f) => (rs.reduce((n, x) => n + f(x), 0) / rs.length).toFixed(1);
        return `${a.orientation ?? a.id} : ${avg((x) => x.rhetorical)} rhétorique(s), rappel ${avg((x) => x.foundRequired.length)}`;
      })
      .filter(Boolean);
    if (rows.length > 1) console.log(`  neutralité ${pair} : ${rows.join(" / ")}`);
  }

  if (o.out) {
    await fs.writeFile(o.out, JSON.stringify({ date: new Date().toISOString(), provider, model, depth: o.depth, webSearch: o.webSearch, summary: s, runs: report }, null, 2));
    console.log(`\nRésultats détaillés : ${o.out}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
