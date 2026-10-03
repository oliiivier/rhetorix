import { describe, expect, it } from "vitest";
import { findQuote, normalizeWithMap } from "../src/text-match";

const find = (page: string, quote: string) => {
  const m = findQuote(normalizeWithMap(page), quote);
  return m && { text: page.slice(m.start, m.end), exact: m.exact };
};

describe("findQuote", () => {
  it("trouve une citation exacte", () => {
    expect(find("Le ministre a dit que tout allait bien.", "tout allait bien")).toEqual({ text: "tout allait bien", exact: true });
  });

  it("ignore typographie, espaces insécables et casse", () => {
    const page = "Il affirme : « C’est   la seule solution » — sans preuve.";
    expect(find(page, `"c'est la seule solution"`)?.text).toBe("C’est   la seule solution");
  });

  it("renvoie des offsets dans le texte source", () => {
    const page = "  Début.\n\n  Une   phrase\ttrès longue.";
    expect(find(page, "une phrase très")?.text).toBe("Une   phrase\ttrès");
  });

  it("se replie sur les extrémités quand le milieu a été altéré", () => {
    const page = "Selon lui, les chiffres du chômage publiés hier démontrent sans aucun doute que la réforme a totalement échoué partout.";
    const quote = "les chiffres du chômage publiés hier prouvent sans le moindre doute que la réforme a totalement échoué partout";
    expect(find(page, quote)).toEqual({ text: page.slice("Selon lui, ".length, -1), exact: false });
  });

  it("renvoie null si la citation est absente", () => {
    expect(find("Rien à voir ici.", "une citation inventée")).toBeNull();
  });
});
