import { describe, expect, it, vi } from "vitest";
import { lookupDoi, parseCrossrefWork } from "../src/crossref";
import { attachStudyRecords } from "../src/studies";
import type { Annotation } from "../src/schema";

const claim = (id: string, doi?: string): Annotation => ({
  id,
  exact_quote: `citation ${id}`,
  category: "factual_claim",
  label: "fait_scientifique",
  severity: "high",
  rhetoric_critique: "",
  fact_check: { status: "supported", context: "", sources: [], evidence: doi ? { kind: "rct", doi } : { kind: "unknown" } },
});

/** Crossref répond pour les DOI connus ; PubMed n'indexe rien, sauf `pubmed` fourni. */
function fakeFetch(works: Record<string, unknown>, pubmed: Record<string, string> = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes("esearch.fcgi")) {
      const doi = decodeURIComponent(url.split("term=")[1]!).replace("[doi]", "");
      return new Response(JSON.stringify({ esearchresult: { idlist: doi in pubmed ? ["123"] : [] } }), { status: 200 });
    }
    if (url.includes("efetch.fcgi")) {
      return new Response(`<PubmedArticleSet><CoiStatement>${Object.values(pubmed)[0]}</CoiStatement></PubmedArticleSet>`, { status: 200 });
    }
    const doi = decodeURIComponent(url.split("/works/")[1]!);
    if (!(doi in works)) return new Response("Resource not found.", { status: 404 });
    return new Response(JSON.stringify({ status: "ok", message: works[doi] }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("parseCrossrefWork (D16)", () => {
  it("lit titre, revue, année et type", () => {
    const r = parseCrossrefWork("10.1/a", {
      DOI: "10.1/A",
      type: "journal-article",
      title: ["Effect of X on Y"],
      "container-title": ["The Lancet"],
      issued: { "date-parts": [[2021, 3]] },
    });
    expect(r).toEqual({ doi: "10.1/A", title: "Effect of X on Y", journal: "The Lancet", year: 2021, type: "journal-article", preprint: false, retracted: false, concern: false });
  });

  it("lit les financeurs et les seules mentions de conflits d'intérêts (D17)", () => {
    const r = parseCrossrefWork("d", {
      funder: [{ name: "Sugar Research Foundation" }, { name: "Sugar Research Foundation" }, {}],
      assertion: [
        { name: "copyright", label: "Copyright", value: "© 2020" },
        { name: "conflict_of_interest", label: "Conflict of interest", value: "<p>The authors declare <b>no</b> competing interests.</p>" },
        { name: "ethics", group: { name: "EthicsHeading", label: "Declarations" }, label: "Competing interests", value: "X is a consultant for Y." },
      ],
    });
    expect(r.funders).toEqual(["Sugar Research Foundation"]);
    expect(r.disclosures).toEqual([
      { source: "crossref", text: "The authors declare no competing interests." },
      { source: "crossref", text: "X is a consultant for Y." },
    ]);
  });

  it("repère prépublication, rétractation et avis de réserve", () => {
    expect(parseCrossrefWork("d", { type: "posted-content", subtype: "preprint", institution: [{ name: "medRxiv" }] })).toMatchObject({ preprint: true, journal: "medRxiv" });
    expect(parseCrossrefWork("d", { "updated-by": [{ type: "retraction" }] }).retracted).toBe(true);
    expect(parseCrossrefWork("d", { title: ["RETRACTED: Old study"] }).retracted).toBe(true);
    expect(parseCrossrefWork("d", { "updated-by": [{ type: "expression_of_concern" }] })).toMatchObject({ concern: true, retracted: false });
  });
});

describe("lookupDoi (D16)", () => {
  it("renvoie null pour un DOI inconnu et lève une erreur sur un autre échec", async () => {
    const signal = new AbortController().signal;
    expect(await lookupDoi("10.1/absent", signal, fakeFetch({}))).toBeNull();
    const failing = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(lookupDoi("10.1/a", signal, failing)).rejects.toThrow("503");
  });
});

describe("attachStudyRecords (D16)", () => {
  it("joint la notice, retire un DOI inconnu et laisse le reste inchangé", async () => {
    const fetchImpl = fakeFetch({ "10.1/ok": { type: "journal-article", title: ["T"], "updated-by": [{ type: "retraction" }] } });
    const out = await attachStudyRecords([claim("a", "10.1/ok"), claim("b", "10.1/absent"), claim("c"), claim("d", "10.1/ok")], new AbortController().signal, fetchImpl);
    expect(out[0]!.fact_check.evidence).toMatchObject({ kind: "rct", doi: "10.1/ok", record: { retracted: true, title: "T" } });
    expect(out[1]!.fact_check.evidence).toEqual({ kind: "rct" });
    expect(out[2]!.fact_check.evidence).toEqual({ kind: "unknown" });
    // Crossref pour chaque DOI distinct, PubMed (recherche seule) pour le DOI trouvé.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("complète par la déclaration d'intérêts PubMed si Crossref n'en a pas (D17)", async () => {
    const fetchImpl = fakeFetch({ "10.1/bio": { type: "journal-article" } }, { "10.1/bio": "A.B. a reçu des honoraires de &lt;Labo&gt;." });
    const [out] = await attachStudyRecords([claim("a", "10.1/bio")], new AbortController().signal, fetchImpl);
    expect(out!.fact_check.evidence?.record?.disclosures).toEqual([{ source: "pubmed", text: "A.B. a reçu des honoraires de <Labo>." }]);
  });

  it("n'interroge pas PubMed si Crossref a une déclaration, ni pour une prépublication", async () => {
    const fetchImpl = fakeFetch({
      "10.1/coi": { assertion: [{ name: "conflict_of_interest", label: "Conflict of interest", value: "None." }] },
      "10.1/pre": { type: "posted-content" },
    });
    await attachStudyRecords([claim("a", "10.1/coi"), claim("b", "10.1/pre")], new AbortController().signal, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("garde la notice Crossref si PubMed est injoignable", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("eutils") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ message: { title: ["T"] } }), { status: 200 }),
    ) as unknown as typeof fetch;
    const [out] = await attachStudyRecords([claim("a", "10.1/ok")], new AbortController().signal, fetchImpl);
    expect(out!.fact_check.evidence?.record).toMatchObject({ title: "T" });
  });

  it("garde le DOI si Crossref est injoignable", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    const out = await attachStudyRecords([claim("a", "10.1/ok")], new AbortController().signal, failing);
    expect(out[0]!.fact_check.evidence).toEqual({ kind: "rct", doi: "10.1/ok" });
  });
});
