import { describe, expect, it } from "vitest";
import { cleanBoundary, findQuote, normalizeWithMap } from "../src/text-match";

const find = (page: string, quote: string) => {
  const m = findQuote(normalizeWithMap(page), quote);
  return m && { text: page.slice(m.start, m.end), exact: m.exact };
};

describe("cleanBoundary", () => {
  it("nettoie les points de suspension et guillemets aux extrémités", () => {
    expect(cleanBoundary("...perdu 38 000 hommes...")).toBe("perdu 38 000 hommes");
    expect(cleanBoundary("…institutions psychiatriques…")).toBe("institutions psychiatriques");
    expect(cleanBoundary("« C'est la seule solution » —")).toBe("C'est la seule solution");
    expect(cleanBoundary("[...] un extrait [...]")).toBe("un extrait");
  });
});

describe("findQuote", () => {
  it("trouve une citation exacte", () => {
    expect(find("Le ministre a dit que tout allait bien.", "tout allait bien")).toEqual({ text: "tout allait bien", exact: true });
  });

  it("ignore typographie, espaces insécables et casse", () => {
    const page = "Il affirme : « C’est   la seule solution » — sans preuve.";
    expect(find(page, `"c'est la seule solution"`)?.text).toBe("C’est   la seule solution");
  });

  it("trouve une citation avec points de suspension initiaux (cas canal de Panama)", () => {
    const page =
      "Le président a affirmé qu'ils ont perdu 38 000 hommes dans la construction du canal de Panama et que tout cela était insensé.";
    const quote = "...perdu 38 000 hommes dans la construction du canal de Panama.";
    const res = find(page, quote);
    expect(res).not.toBeNull();
    expect(res?.text).toBe("perdu 38 000 hommes dans la construction du canal de Panama");
  });

  it("trouve une citation avec points de suspension finaux (cas institutions psychiatriques)", () => {
    const page =
      "Ils offrent sanctuaire à des criminels souvent issus de prisons et d'institutions psychiatriques. La marine n'y échappe pas.";
    const quote = "souvent issus de prisons et d'institutions psychiatriques...";
    const res = find(page, quote);
    expect(res).not.toBeNull();
    expect(res?.text).toBe("souvent issus de prisons et d'institutions psychiatriques");
  });

  it("trouve une citation avec ellipsis interne [...]", () => {
    const page =
      "Le président McKinley a rendu notre pays très riche grâce à ses tarifs douaniers et à son talent.";
    const quote = "Le président McKinley a rendu notre pays très riche [...] et à son talent.";
    const res = find(page, quote);
    expect(res).not.toBeNull();
    expect(res?.text).toBe("Le président McKinley a rendu notre pays très riche grâce à ses tarifs douaniers et à son talent");
  });

  it("tolère des variations de ponctuation interne (tirets vs virgules)", () => {
    const page = "Les navires américains sont surtaxés, et ne sont pas traités équitablement.";
    const quote = "Les navires américains sont surtaxés - et ne sont pas traités équitablement";
    const res = find(page, quote);
    expect(res).not.toBeNull();
    expect(res?.text).toBe("Les navires américains sont surtaxés, et ne sont pas traités équitablement");
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
