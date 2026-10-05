import { describe, expect, it, vi } from "vitest";
import { lookupPubmedCoi, parseCoiStatements, xmlText } from "../src/pubmed";

describe("PubMed (D17)", () => {
  it("lit les déclarations <CoiStatement> et décode les entités", () => {
    const xml = `<Article><CoiStatement>Dr A received fees from <i>Pharma</i> &amp; Co. &#233;t&#xE9;</CoiStatement></Article>`;
    expect(parseCoiStatements(xml)).toEqual(["Dr A received fees from Pharma & Co. été"]);
    expect(parseCoiStatements("<Article></Article>")).toEqual([]);
    expect(xmlText("a&nbsp;b")).toBe("a&nbsp;b");
  });

  it("cherche le DOI puis lit la notice ; null si le DOI n'est pas indexé ou ambigu", async () => {
    const calls: string[] = [];
    const fetchFor = (ids: string[]) =>
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("esearch")) return new Response(JSON.stringify({ esearchresult: { idlist: ids } }), { status: 200 });
        return new Response("<CoiStatement>None declared.</CoiStatement>", { status: 200 });
      }) as unknown as typeof fetch;
    const signal = new AbortController().signal;
    expect(await lookupPubmedCoi("10.1000/x", signal, fetchFor(["42"]))).toBe("None declared.");
    expect(calls[0]).toContain("term=10.1000%2Fx%5Bdoi%5D");
    expect(calls[1]).toContain("id=42");
    expect(await lookupPubmedCoi("10.1000/x", signal, fetchFor([]))).toBeNull();
    expect(await lookupPubmedCoi("10.1000/x", signal, fetchFor(["1", "2"]))).toBeNull();
  });
});
