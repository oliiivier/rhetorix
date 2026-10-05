/// <reference types="node" />
// Cohérence du corpus d'évaluation (eval/corpus, voir son README) : fiches bien
// formées, labels de la taxonomie, stockage conforme à la licence, citations
// présentes dans le texte.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FACT_STATUSES } from "../src/schema";
import { CATEGORIES, isLabelOf, type Category } from "../src/taxonomy";
import { normalize } from "../src/text-match";

const ROOT = join(__dirname, "..", "eval", "corpus");
const KINDS = ["synthetic", "public_domain", "open_license", "copyrighted"];
const PRESENCE = ["present", "absent", "any"];

interface Expected {
  quote: string;
  accept: string[];
  required: boolean;
  fact_status?: string[];
  note?: string;
}

interface CorpusArticle {
  id: string;
  title: string;
  lang: string;
  kind: string;
  purpose: string;
  control?: boolean;
  license: { name: string; redistributable: boolean };
  text_sha256?: string;
  document: { clickbait_gap: string; blind_spot: string };
  limits?: { max_rhetorical?: number };
  expected: Expected[];
  not_expected?: { quote: string; note?: string }[];
}

const articles: CorpusArticle[] = readdirSync(join(ROOT, "articles"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(ROOT, "articles", f), "utf8")) as CorpusArticle);

const repoText = (a: CorpusArticle) => join(ROOT, "texts", `${a.id}.txt`);
const localText = (a: CorpusArticle) => join(ROOT, ".local", `${a.id}.txt`);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("corpus d'évaluation", () => {
  it("contient des fiches aux identifiants uniques", () => {
    expect(articles.length).toBeGreaterThan(0);
    expect(new Set(articles.map((a) => a.id)).size).toBe(articles.length);
  });

  describe.each(articles.map((a) => [a.id, a] as const))("%s", (_id, a) => {
    it("est une fiche bien formée", () => {
      expect(a.title).toBeTruthy();
      expect(["fr", "en", "es", "de", "it"]).toContain(a.lang);
      expect(KINDS).toContain(a.kind);
      expect(a.purpose).toBeTruthy();
      expect(typeof a.license.redistributable).toBe("boolean");
      expect(PRESENCE).toContain(a.document.clickbait_gap);
      expect(PRESENCE).toContain(a.document.blind_spot);
      if (a.kind === "copyrighted") expect(a.license.redistributable).toBe(false);
      if (a.kind !== "copyrighted") expect(a.license.redistributable).toBe(true);
    });

    it("n'utilise que des labels de la taxonomie et des statuts du schéma", () => {
      for (const e of a.expected) {
        expect(e.accept.length).toBeGreaterThan(0);
        for (const ref of e.accept) {
          const [category, label] = ref.split("/");
          expect(CATEGORIES, ref).toContain(category);
          expect(isLabelOf(category as Category, label ?? ""), ref).toBe(true);
        }
        for (const s of e.fact_status ?? []) expect(FACT_STATUSES).toContain(s);
      }
    });

    it("stocke le texte selon sa licence", () => {
      // Texte libre : versionné dans texts/. Texte non libre : jamais dans texts/.
      expect(existsSync(repoText(a))).toBe(a.license.redistributable);
    });

    // Un texte non libre n'est vérifié que s'il a été récupéré et n'a pas changé en ligne.
    const path = a.license.redistributable ? repoText(a) : localText(a);
    const text = existsSync(path) ? readFileSync(path, "utf8").trim() : null;
    const checkable = text !== null && (a.license.redistributable || sha256(text) === a.text_sha256);

    it.runIf(checkable)("contient chaque citation attendue", () => {
      if (a.license.redistributable) expect(sha256(text!)).toBe(a.text_sha256);
      const hay = normalize(text!);
      for (const q of [...a.expected, ...(a.not_expected ?? [])]) {
        expect(hay.includes(normalize(q.quote)), q.quote).toBe(true);
      }
    });
  });
});
