import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTEMPTS, postJson, retryAfterMs, retryDelay, type RetryInfo } from "../src/providers/http";
import { ProviderError } from "../src/providers/types";

describe("retryDelay (A4)", () => {
  it("retente les statuts passagers avec un délai croissant", () => {
    expect(retryDelay(429, null, 1)).toBe(2000);
    expect(retryDelay(503, null, 2)).toBe(4000);
    expect(retryDelay(529, null, 1)).toBe(2000);
  });

  it("ne retente ni les erreurs définitives ni au-delà du nombre d'essais", () => {
    expect(retryDelay(400, null, 1)).toBeNull();
    expect(retryDelay(401, null, 1)).toBeNull();
    expect(retryDelay(429, null, MAX_ATTEMPTS)).toBeNull();
  });

  it("respecte Retry-After, sauf attente trop longue (quota épuisé)", () => {
    expect(retryDelay(429, "7", 1)).toBe(7000);
    expect(retryDelay(429, "3600", 1)).toBeNull();
  });

  it("lit Retry-After en secondes ou en date HTTP", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:05 GMT", Date.parse("Wed, 21 Oct 2026 07:28:00 GMT"))).toBe(5000);
    expect(retryAfterMs("n'importe quoi")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});

describe("postJson (A4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const reply = (status: number, headers: Record<string, string> = {}) =>
    new Response(status === 200 ? "{}" : JSON.stringify({ error: { message: "saturé" } }), { status, headers });

  it("réussit après une erreur passagère et signale la nouvelle tentative", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429, { "retry-after": "1" })).mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);
    const retries: RetryInfo[] = [];
    const promise = postJson("https://x.test", {}, {}, new AbortController().signal, "X", (r) => retries.push(r));
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retries).toEqual([{ attempt: 1, delayMs: 1000, status: 429 }]);
  });

  it("échoue après le dernier essai", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => reply(503));
    vi.stubGlobal("fetch", fetchMock);
    const promise = postJson("https://x.test", {}, {}, new AbortController().signal, "X");
    const assertion = expect(promise).rejects.toBeInstanceOf(ProviderError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("n'attend pas après une annulation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply(429)));
    const controller = new AbortController();
    const promise = postJson("https://x.test", {}, {}, controller.signal, "X", () => controller.abort());
    await expect(promise).rejects.toThrow();
  });

  it("ne retente pas une erreur définitive", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(postJson("https://x.test", {}, {}, new AbortController().signal, "X")).rejects.toThrow("Erreur 401 de X : saturé");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
