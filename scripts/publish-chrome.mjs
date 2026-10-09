#!/usr/bin/env node
// Envoie le paquet Chrome au Chrome Web Store et le soumet à la revue (API v2).
// Appelé par le workflow .github/workflows/release.yml ; voir docs/techniques/publication.md.
//
// Variables d'environnement :
//   CWS_ACCESS_TOKEN  jeton OAuth (scope chromewebstore) du compte de service, jamais journalisé
//   CWS_PUBLISHER_ID  identifiant d'éditeur (Developer Dashboard, section Account)
//   CWS_EXTENSION_ID  identifiant de l'extension sur le store
//
// Usage :
//   node scripts/publish-chrome.mjs <paquet.zip>

import { readFileSync } from "node:fs";

const API = "https://chromewebstore.googleapis.com";
const POLL_INTERVAL_MS = 5_000;
const POLL_ATTEMPTS = 24;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

async function call(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${env("CWS_ACCESS_TOKEN")}`, ...init?.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} : HTTP ${res.status}\n${body}`);
  return body ? JSON.parse(body) : {};
}

/** Attend la fin d'un envoi traité de façon asynchrone par le store. */
async function waitForUpload(item) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await call(`${API}/v2/${item}:fetchStatus`);
    const state = status.lastAsyncUploadState;
    console.log(`État de l'envoi : ${state}`);
    if (state === "SUCCEEDED") return;
    if (state !== "IN_PROGRESS") throw new Error(`Envoi refusé par le store : ${JSON.stringify(status)}`);
  }
  throw new Error("Envoi toujours en cours après le délai d'attente.");
}

async function main() {
  const zip = process.argv[2];
  if (!zip) throw new Error("Usage : node scripts/publish-chrome.mjs <paquet.zip>");
  const item = `publishers/${env("CWS_PUBLISHER_ID")}/items/${env("CWS_EXTENSION_ID")}`;

  const upload = await call(`${API}/upload/v2/${item}:upload`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: readFileSync(zip),
  });
  console.log(`Envoi : ${upload.uploadState}${upload.crxVersion ? `, version ${upload.crxVersion}` : ""}`);
  if (upload.uploadState === "IN_PROGRESS") await waitForUpload(item);
  else if (upload.uploadState !== "SUCCEEDED") throw new Error(`Envoi refusé par le store : ${JSON.stringify(upload)}`);

  // Publication dès l'approbation par la revue de Google.
  const publish = await call(`${API}/v2/${item}:publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
  });
  console.log(`Soumission : ${publish.state}`);
  for (const w of publish.warningInfo?.warnings ?? []) console.warn(`Avertissement : ${w.reason} ${w.description}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
