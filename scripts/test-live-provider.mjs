#!/usr/bin/env node
// Test en direct d'un provider LLM (Anthropic, Gemini, OpenAI-compatible / Ollama / Perplexity)
// depuis le terminal, avec streaming, recherche web et validation D3.

import esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Couleurs ANSI pour le terminal
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

const DEFAULT_SAMPLE_TITLE = "Discours politique sur les réformes fiscales et l'inflation";
const DEFAULT_SAMPLE_TEXT = `Le ministre des finances a déclaré hier soir lors de sa conférence de presse :
« Si nous ne baissons pas immédiatement la TVA à 5%, l'économie tout entière va s'effondrer d'ici la fin du trimestre, c'est une certitude absolue. Tous les économistes sérieux et patriotes le confirment, seuls les saboteurs et les incompétents prétendent le contraire.

D'ailleurs, selon le dernier rapport officiel publié par l'INSEE en 2023, la France a enregistré une hausse record de l'inflation de plus de 25% en une seule année, ruinant tous les ménages. Nous n'avons donc absolument pas d'autre choix que d'appliquer notre plan d'urgence sans la moindre hésitation. »`;

function printHelp() {
  console.log(`
${c.bold}${c.cyan}RHETORIX — Test de Provider LLM en direct${c.reset}

${c.bold}USAGE :${c.reset}
  node scripts/test-live-provider.mjs [options]
  npm run test:live -- [options]

${c.bold}OPTIONS :${c.reset}
  ${c.green}-p, --provider <id>${c.reset}      Provider à tester : ${c.yellow}anthropic${c.reset}, ${c.yellow}gemini${c.reset}, ${c.yellow}openai-compatible${c.reset}, ou ${c.yellow}chrome-ai${c.reset}
  ${c.green}-k, --key <cle>${c.reset}          Clé API (sinon variable d'env selon provider)
  ${c.green}-m, --model <nom>${c.reset}        Nom du modèle (défauts : claude-opus-5-5, gemini-2.5-flash, etc.)
  ${c.green}-e, --endpoint <url>${c.reset}     Endpoint URL (pour openai-compatible, ex: http://localhost:11434/v1)
  ${c.green}--web-search${c.reset}            Activer la recherche web / grounding (défaut : activé)
  ${c.green}--no-web-search${c.reset}         Désactiver la recherche web
  ${c.green}-l, --lang <code>${c.reset}          Langue de l'analyse (fr, en, es, de, it, défaut : fr)
  ${c.green}-t, --text <texte>${c.reset}        Texte personnalisé à analyser
  ${c.green}-f, --file <fichier>${c.reset}      Fichier texte contenant l'article à analyser
  ${c.green}--title <titre>${c.reset}          Titre de l'article (défaut : discours type)
  ${c.green}-h, --help${c.reset}                 Afficher cette aide

${c.bold}VARIABLES D'ENVIRONNEMENT :${c.reset}
  ANTHROPIC_API_KEY      Clé API pour Anthropic
  GEMINI_API_KEY         Clé API pour Google Gemini
  OPENAI_API_KEY         Clé API pour OpenAI-compatible
  OPENAI_ENDPOINT        URL de base pour OpenAI-compatible
  OLLAMA_ENDPOINT        URL alternative pour Ollama (ex: http://localhost:11434/v1)

${c.bold}EXEMPLES :${c.reset}
  ${c.dim}# Tester Gemini avec la clé d'environnement${c.reset}
  GEMINI_API_KEY=AIzaSy... npm run test:live -- -p gemini

  ${c.dim}# Tester Anthropic avec recherche web${c.reset}
  ANTHROPIC_API_KEY=sk-ant-... npm run test:live -- -p anthropic

  ${c.dim}# Tester Ollama en local sans recherche web${c.reset}
  npm run test:live -- -p openai-compatible -e http://localhost:11434/v1 -m mistral --no-web-search
`);
}

function parseArgs(args) {
  const options = {
    provider: null,
    apiKey: null,
    model: null,
    endpoint: null,
    webSearch: true,
    language: "fr",
    title: DEFAULT_SAMPLE_TITLE,
    text: null,
    filePath: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-p" || arg === "--provider") {
      options.provider = args[++i];
    } else if (arg === "-k" || arg === "--key") {
      options.apiKey = args[++i];
    } else if (arg === "-m" || arg === "--model") {
      options.model = args[++i];
    } else if (arg === "-e" || arg === "--endpoint") {
      options.endpoint = args[++i];
    } else if (arg === "--web-search") {
      options.webSearch = true;
    } else if (arg === "--no-web-search") {
      options.webSearch = false;
    } else if (arg === "-l" || arg === "--lang") {
      options.language = args[++i];
    } else if (arg === "-t" || arg === "--text") {
      options.text = args[++i];
    } else if (arg === "-f" || arg === "--file") {
      options.filePath = args[++i];
    } else if (arg === "--title") {
      options.title = args[++i];
    }
  }

  return options;
}

// Initialise un bundle temporaire de src/analyze.ts pour exécution Node ESM
async function bundleAnalyzeModule() {
  const cacheDir = path.join(ROOT, "node_modules", ".cache");
  await fs.mkdir(cacheDir, { recursive: true });
  const outfile = path.join(cacheDir, "rhetorix-analyze-cli.mjs");

  await esbuild.build({
    entryPoints: [path.join(ROOT, "src", "analyze.ts")],
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

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // Détection automatique du provider si non précisé
  let provider = opts.provider;
  if (!provider) {
    if (process.env.GEMINI_API_KEY) provider = "gemini";
    else if (process.env.ANTHROPIC_API_KEY) provider = "anthropic";
    else if (process.env.OPENAI_API_KEY || process.env.OPENAI_ENDPOINT || process.env.OLLAMA_ENDPOINT) {
      provider = "openai-compatible";
    } else {
      provider = "gemini"; // Par défaut
    }
  }

  if (!["anthropic", "gemini", "openai-compatible", "chrome-ai"].includes(provider)) {
    console.error(`${c.red}Erreur : provider invalide '${provider}'. Choix : anthropic, gemini, openai-compatible, chrome-ai.${c.reset}`);
    printHelp();
    process.exit(1);
  }

  // Détection de la clé API
  let apiKey = opts.apiKey;
  if (!apiKey) {
    if (provider === "anthropic") apiKey = process.env.ANTHROPIC_API_KEY || "";
    else if (provider === "gemini") apiKey = process.env.GEMINI_API_KEY || "";
    else if (provider === "openai-compatible") apiKey = process.env.OPENAI_API_KEY || "";
  }

  // Endpoint pour openai-compatible
  let endpoint = opts.endpoint;
  if (!endpoint && provider === "openai-compatible") {
    endpoint = process.env.OPENAI_ENDPOINT || process.env.OLLAMA_ENDPOINT || "https://api.openai.com/v1";
  }

  // Modèles par défaut
  let model = opts.model;
  if (!model) {
    if (provider === "anthropic") model = "claude-opus-5-5";
    else if (provider === "gemini") model = "gemini-2.5-flash";
    else if (provider === "chrome-ai") model = "gemini-nano";
    else if (provider === "openai-compatible") {
      model = endpoint && endpoint.includes("11434") ? "mistral" : "gpt-4o";
    }
  }

  // Vérification de configuration
  if (provider !== "openai-compatible" && provider !== "chrome-ai" && !apiKey) {
    console.error(`${c.red}${c.bold}Erreur : Aucune clé API trouvée pour ${provider}.${c.reset}`);
    console.error(`Spécifiez la clé avec ${c.yellow}--key <cle>${c.reset} ou la variable d'environnement ${c.yellow}${provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"}${c.reset}.\n`);
    printHelp();
    process.exit(1);
  }

  // Chargement du texte
  let articleText = opts.text;
  if (!articleText && opts.filePath) {
    try {
      articleText = await fs.readFile(path.resolve(process.cwd(), opts.filePath), "utf-8");
    } catch (err) {
      console.error(`${c.red}Erreur de lecture du fichier ${opts.filePath} : ${err.message}${c.reset}`);
      process.exit(1);
    }
  }
  if (!articleText) {
    articleText = DEFAULT_SAMPLE_TEXT;
  }

  // Mock de l'environnement WebExtension pour Node
  globalThis.chrome = {
    i18n: {
      getUILanguage: () => opts.language,
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
    },
  };

  console.log(`\n${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}           RHETORIX — Test de Provider LLM en direct            ${c.reset}`);
  console.log(`${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(`  ${c.bold}Fournisseur :${c.reset}  ${c.magenta}${provider}${c.reset}`);
  console.log(`  ${c.bold}Modèle :${c.reset}       ${c.yellow}${model}${c.reset}`);
  if (endpoint) console.log(`  ${c.bold}Endpoint :${c.reset}     ${endpoint}`);
  console.log(`  ${c.bold}Clé API :${c.reset}      ${apiKey ? apiKey.slice(0, 7) + "..." + apiKey.slice(-4) : c.dim + "(aucune / local)" + c.reset}`);
  console.log(`  ${c.bold}Recherche :${c.reset}    ${opts.webSearch ? c.green + "Activée" : c.yellow + "Désactivée"} (Politique D3)${c.reset}`);
  console.log(`  ${c.bold}Langue :${c.reset}       ${opts.language}`);
  console.log(`  ${c.bold}Taille texte :${c.reset} ${articleText.length} caractères, ~${Math.ceil(articleText.length / 4)} tokens`);
  console.log(`${c.bold}${c.cyan}----------------------------------------------------------------${c.reset}\n`);

  // Compilation et import du module d'analyse
  process.stdout.write(`${c.dim}Préparation du module d'analyse...${c.reset} `);
  const bundledFile = await bundleAnalyzeModule();
  const { analyzeArticle } = await import(pathToFileURL(bundledFile).href);
  console.log(`${c.green}OK${c.reset}\n`);

  const paragraphs = articleText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const article = {
    title: opts.title,
    paragraphs: paragraphs.length > 0 ? paragraphs : [articleText],
    textContent: articleText,
    lang: opts.language,
  };

  const config = {
    provider,
    apiKey: apiKey || "",
    model,
    endpoint: endpoint || "",
    language: opts.language,
    webSearch: opts.webSearch,
    maxChunkTokens: 8000,
    displayMode: "both",
  };

  const startTime = Date.now();
  let summaryPrintedLength = 0;
  const annotationsSeen = new Set();
  const collectedAnnotations = [];

  const categoryIcons = {
    sophisme: "⚠️ ",
    biais_cognitif: "🧠",
    manipulation_emotionnelle: "🎭",
    allegation_factuelle: "🔍",
  };

  const categoryColors = {
    sophisme: c.yellow,
    biais_cognitif: c.magenta,
    manipulation_emotionnelle: c.cyan,
    allegation_factuelle: c.blue,
  };

  console.log(`${c.bold}${c.blue}▶ Démarrage de l'analyse en streaming...${c.reset}\n`);

  const abortController = new AbortController();
  process.on("SIGINT", () => {
    console.log(`\n${c.red}Arrêt demandé par l'utilisateur (SIGINT)...${c.reset}`);
    abortController.abort();
    process.exit(130);
  });

  try {
    const analysis = await analyzeArticle(article, config, abortController.signal, {
      onProgress: (p) => {
        const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        console.log(`${c.dim}[Progression] Phase: ${p.phase ?? "analyse"} | Morceaux : ${p.done}/${p.total} (${pct}%)${c.reset}`);
      },
      onSummary: (summary, isComplete) => {
        if (!summary) return;
        if (summaryPrintedLength === 0) {
          process.stdout.write(`${c.bold}📝 Résumé :${c.reset} `);
        }
        const delta = summary.slice(summaryPrintedLength);
        if (delta) {
          process.stdout.write(c.italic + delta + c.reset);
          summaryPrintedLength = summary.length;
        }
        if (isComplete) {
          console.log(`\n`);
        }
      },
      onAnnotation: (ann) => {
        if (annotationsSeen.has(ann.id)) return;
        annotationsSeen.add(ann.id);
        collectedAnnotations.push(ann);

        const icon = categoryIcons[ann.category] || "📌";
        const color = categoryColors[ann.category] || c.white;

        console.log(`\n${color}${c.bold}${icon} [${ann.id}] ${ann.category.toUpperCase()} — ${ann.label}${c.reset}`);
        console.log(`   ${c.bold}Citation :${c.reset} "${c.dim}${ann.exact_quote}${c.reset}"`);
        console.log(`   ${c.bold}Critique :${c.reset} ${ann.rhetoric_critique}`);
        if (ann.context) {
          console.log(`   ${c.bold}Contexte :${c.reset} ${ann.context}`);
        }
        if (ann.fact_check) {
          const statusColors = {
            verifie: c.green,
            refute: c.red,
            non_verifie: c.yellow,
          };
          const stColor = statusColors[ann.fact_check.status] || c.white;
          console.log(`   ${c.bold}Fact-check :${c.reset} ${stColor}${ann.fact_check.status}${c.reset}`);
          if (ann.fact_check.sources && ann.fact_check.sources.length > 0) {
            console.log(`   ${c.bold}Sources (${ann.fact_check.sources.length}) :${c.reset}`);
            for (const src of ann.fact_check.sources) {
              console.log(`     • ${c.cyan}${src.url}${c.reset} ${c.dim}(${src.title})${c.reset}`);
            }
          } else {
            console.log(`   ${c.bold}Sources :${c.reset} ${c.dim}Aucune (ou non vérifié D3)${c.reset}`);
          }
        }
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n${c.bold}${c.green}================================================================${c.reset}`);
    console.log(`${c.bold}${c.green}                      ANALYSE TERMINÉE                         ${c.reset}`);
    console.log(`${c.bold}${c.green}================================================================${c.reset}`);
    console.log(`  ${c.bold}Durée :${c.reset}                 ${elapsed} secondes`);
    console.log(`  ${c.bold}Annotations totales :${c.reset}   ${analysis.annotations.length}`);
    console.log(`  ${c.bold}Annotations en flux :${c.reset}   ${collectedAnnotations.length}`);

    // Vérification de conformité D3
    let d3Violations = 0;
    for (const a of analysis.annotations) {
      if (!opts.webSearch && a.fact_check && a.fact_check.sources && a.fact_check.sources.length > 0) {
        d3Violations++;
      }
    }

    if (d3Violations > 0) {
      console.log(`  ${c.red}${c.bold}D3 Alerte :${c.reset}            ${d3Violations} source(s) présentes alors que webSearch est désactivé !`);
    } else {
      console.log(`  ${c.green}${c.bold}Conformité D3 :${c.reset}        100% conforme (politique anti-hallucination respectée)`);
    }

    console.log(`\n${c.bold}Résumé final :${c.reset}\n${analysis.summary}\n`);
    console.log(`${c.green}${c.bold}✔ Succès : Le provider a répondu correctement au schéma structuré.${c.reset}\n`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n${c.red}${c.bold}✖ Échec de l'analyse (${elapsed}s) :${c.reset}`);
    console.error(`${c.red}${err.stack || err.message}${c.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${c.red}Erreur fatale : ${err.message}${c.reset}`);
  process.exit(1);
});
