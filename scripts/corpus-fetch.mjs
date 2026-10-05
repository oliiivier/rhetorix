#!/usr/bin/env node
// Récupère les textes du corpus d'évaluation (eval/corpus) à partir de leur URL,
// avec la même extraction que le content script (Readability, blocs feuilles).
//
// Le lieu de stockage dépend de la licence (voir eval/corpus/README.md) :
// - texte librement redistribuable : eval/corpus/texts/<id>.txt, versionné ;
// - texte non libre : eval/corpus/.local/<id>.txt, ignoré par git.
//
// Usage :
//   node scripts/corpus-fetch.mjs              récupère les textes absents
//   node scripts/corpus-fetch.mjs <id>…        récupère (ou re-récupère) ces articles
//   node scripts/corpus-fetch.mjs --check      vérifie l'empreinte des textes présents
//   node scripts/corpus-fetch.mjs --set-hash <id>…  enregistre l'empreinte du texte récupéré

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "eval", "corpus");
const ARTICLES = join(ROOT, "articles");

// Mêmes sélecteurs que src/content-script.ts (extract).
const LEAF_BLOCKS = "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, figcaption, td";

export function textPath(article) {
  return join(ROOT, article.license.redistributable ? "texts" : ".local", `${article.id}.txt`);
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function loadArticles() {
  return readdirSync(ARTICLES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: join(ARTICLES, f), data: JSON.parse(readFileSync(join(ARTICLES, f), "utf8")) }));
}

function extract(html, url) {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article?.content) throw new Error("aucun contenu d'article détecté");
  const doc = new JSDOM(article.content).window.document;
  let paragraphs = [...doc.body.querySelectorAll(LEAF_BLOCKS)]
    .filter((el) => !el.querySelector(LEAF_BLOCKS))
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    paragraphs = (article.textContent ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }
  if (paragraphs.length === 0) throw new Error("article extrait vide");
  return paragraphs;
}

async function fetchArticle(article) {
  const url = article.source?.fetch_url ?? article.source?.url;
  if (!url) throw new Error("pas d'URL source (texte rédigé à la main ?)");
  const res = await fetch(url, { headers: { "user-agent": "rhetorix-corpus/0.1 (évaluation locale)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const paragraphs = extract(await res.text(), url);
  const text = paragraphs.join("\n\n") + "\n";
  const path = textPath(article);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return { path, hash: sha256(paragraphs.join("\n\n")), count: paragraphs.length };
}

function hashOfFile(path) {
  return sha256(readFileSync(path, "utf8").trim());
}

async function main() {
  const args = process.argv.slice(2);
  const articles = loadArticles();

  if (args[0] === "--check") {
    let bad = 0;
    for (const { data } of articles) {
      const path = textPath(data);
      if (!existsSync(path)) {
        console.log(`absent    ${data.id}`);
        continue;
      }
      const ok = !data.text_sha256 || hashOfFile(path) === data.text_sha256;
      if (!ok) bad++;
      console.log(`${ok ? "ok       " : "MODIFIÉ  "} ${data.id}`);
    }
    process.exit(bad ? 1 : 0);
  }

  if (args[0] === "--set-hash") {
    for (const { file, data } of articles.filter((a) => args.slice(1).includes(a.data.id))) {
      data.text_sha256 = hashOfFile(textPath(data));
      writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
      console.log(`empreinte enregistrée : ${data.id}`);
    }
    return;
  }

  const targets = args.length
    ? articles.filter((a) => args.includes(a.data.id))
    : articles.filter((a) => a.data.source?.url && !existsSync(textPath(a.data)));
  for (const { data } of targets) {
    try {
      const { path, hash, count } = await fetchArticle(data);
      const drift = data.text_sha256 && data.text_sha256 !== hash ? " (texte différent de l'empreinte enregistrée)" : "";
      console.log(`${data.id} : ${count} paragraphes → ${path}${drift}`);
    } catch (err) {
      console.error(`${data.id} : échec, ${err.message}`);
      process.exitCode = 1;
    }
  }
}

await main();
