import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/cache";

describe("normalizeUrl", () => {
  it("retire fragment et paramètres de suivi, trie les autres", () => {
    expect(normalizeUrl("https://ex.org/a?utm_source=x&b=2&a=1&fbclid=z#top")).toBe("https://ex.org/a?a=1&b=2");
  });
});
