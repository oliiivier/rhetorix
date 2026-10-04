// Cache des analyses par URL dans storage.local (décision D7, architecture §8).

import type { Analysis } from "./schema";
import { ext } from "./ext";

export interface CacheEntry {
  analysis: Analysis;
  textHash: string;
  provider: string;
  model: string;
  lang: string;
  createdAt: number;
}

export type CacheFingerprint = Omit<CacheEntry, "analysis" | "createdAt">;

const PREFIX = "cache:";
const INDEX_KEY = "cache-index";
export const MAX_ENTRIES = 200;

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|xtor|at_\w+)$/i;

/** URL sans fragment ni paramètres de suivi, paramètres restants triés. */
export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = new URLSearchParams(params).toString();
  return u.toString();
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function matchesFingerprint(entry: CacheEntry, fp: CacheFingerprint): boolean {
  return entry.textHash === fp.textHash && entry.provider === fp.provider && entry.model === fp.model && entry.lang === fp.lang;
}

async function readIndex(): Promise<string[]> {
  return ((await ext.storage.local.get(INDEX_KEY))[INDEX_KEY] as string[] | undefined) ?? [];
}

export async function getCached(url: string, fp: CacheFingerprint): Promise<CacheEntry | null> {
  const key = PREFIX + normalizeUrl(url);
  const entry = (await ext.storage.local.get(key))[key] as CacheEntry | undefined;
  if (!entry || !matchesFingerprint(entry, fp)) return null;
  await touch(key);
  return entry;
}

export async function getCachedByUrl(url: string): Promise<CacheEntry | null> {
  try {
    const key = PREFIX + normalizeUrl(url);
    const entry = (await ext.storage.local.get(key))[key] as CacheEntry | undefined;
    if (!entry) return null;
    await touch(key);
    return entry;
  } catch {
    return null;
  }
}

export async function putCached(url: string, entry: CacheEntry): Promise<void> {
  const key = PREFIX + normalizeUrl(url);
  await ext.storage.local.set({ [key]: entry });
  await touch(key);
}

/** Index LRU : clé la plus récente en fin de liste ; purge au-delà de MAX_ENTRIES. */
async function touch(key: string): Promise<void> {
  const index = (await readIndex()).filter((k) => k !== key);
  index.push(key);
  const evicted = index.splice(0, Math.max(0, index.length - MAX_ENTRIES));
  if (evicted.length) await ext.storage.local.remove(evicted);
  await ext.storage.local.set({ [INDEX_KEY]: index });
}

export async function clearCache(): Promise<void> {
  const index = await readIndex();
  await ext.storage.local.remove([...index, INDEX_KEY]);
}
