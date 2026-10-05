import { describe, expect, it } from "vitest";
import { ISSUES_URL, contestKey, issueUrl, type ContestedAnnotation } from "../src/contested";

const entry = (over: Partial<ContestedAnnotation["annotation"]> = {}): ContestedAnnotation => ({
  key: "k",
  url: "https://intranet.test/note?id=7",
  pageTitle: "Note interne",
  contestedAt: 0,
  annotation: {
    exact_quote: "Une citation",
    category: "bias",
    label: "langage_charge",
    severity: "medium",
    confidence: "low",
    rhetoric_critique: "Le mot est neutre.",
    fact_check: { status: "unverified", context: "", sources: [] },
    ...over,
  },
  engine: { provider: "gemini", model: "gemini-3.8-flash", engineVersion: 6, depth: "fast", lang: "fr", webSearch: false },
});

function body(url: string): string {
  return new URL(url).searchParams.get("body") ?? "";
}

describe("contestKey (Q4)", () => {
  it("identifie l'annotation par page, étiquette et citation, sans le fragment", () => {
    const a = entry().annotation;
    expect(contestKey("https://ex.test/a#x", a)).toBe(contestKey("https://ex.test/a", a));
    expect(contestKey("https://ex.test/a", a)).not.toBe(contestKey("https://ex.test/a", { ...a, label: "autre" }));
  });
});

describe("issueUrl (Q4)", () => {
  it("préremplit un ticket avec l'annotation, le moteur et le commentaire", () => {
    const url = issueUrl(entry(), { includeUrl: true, comment: "Ce n'est pas un biais.", extensionVersion: "0.2.0" });
    expect(url.startsWith(`${ISSUES_URL}?`)).toBe(true);
    expect(new URL(url).searchParams.get("title")).toBe("Annotation contestable : bias/langage_charge");
    const text = body(url);
    expect(text).toContain("https://intranet.test/note?id=7");
    expect(text).toContain("> Une citation");
    expect(text).toContain("confiance low");
    expect(text).toContain("Ce n'est pas un biais.");
    expect(text).toContain("gemini / gemini-3.8-flash, version 6");
    expect(text).toContain("extension 0.2.0");
  });

  it("omet l'adresse de la page si l'utilisateur la décoche", () => {
    const text = body(issueUrl(entry(), { includeUrl: false }));
    expect(text).not.toContain("intranet.test");
    expect(text).toContain("Note interne");
  });

  it("raccourcit le corps pour rester sous la limite de GitHub", () => {
    const long = "x".repeat(20_000);
    const url = issueUrl(entry({ exact_quote: long, rhetoric_critique: long }), { includeUrl: true, comment: long });
    expect(url.length).toBeLessThanOrEqual(7500);
    expect(body(url)).toContain("…");
  });

  it("signale une annotation d'ensemble sans citation (B3)", () => {
    expect(body(issueUrl(entry({ exact_quote: "" }), { includeUrl: true }))).toContain("aucune (annotation sur l'ensemble de l'article)");
  });
});
