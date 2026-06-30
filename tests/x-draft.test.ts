import { describe, it, expect } from "vitest";
import { splitIntoThread, parseDraftJson, TWEET_LIMIT } from "../src/x-draft.js";

describe("x-draft — splitIntoThread", () => {
  it("texto curto vira um único tweet (passthrough)", () => {
    const out = splitIntoThread("Olá, mundo!");
    expect(out).toEqual(["Olá, mundo!"]);
  });

  it("respeita o limite de 280 em cada tweet", () => {
    const long = Array.from({ length: 60 }, (_, i) => `frase número ${i}.`).join(" ");
    const out = splitIntoThread(long, { numbered: false });
    expect(out.length).toBeGreaterThan(1);
    for (const t of out) expect(t.length).toBeLessThanOrEqual(TWEET_LIMIT);
  });

  it("nunca corta no meio de uma palavra", () => {
    const words = Array.from({ length: 80 }, () => "palavra").join(" ");
    const out = splitIntoThread(words, { numbered: false });
    for (const t of out) {
      // sem espaço sobrando nas bordas e formado só por palavras inteiras
      expect(t).toBe(t.trim());
      for (const w of t.split(/\s+/)) expect(w).toBe("palavra");
    }
  });

  it("numeração (i/n) é contada no orçamento de 280", () => {
    const long = Array.from({ length: 90 }, (_, i) => `item ${i} aqui.`).join(" ");
    const out = splitIntoThread(long, { limit: 280, numbered: true });
    expect(out.length).toBeGreaterThan(1);
    const n = out.length;
    out.forEach((t, i) => {
      expect(t.length).toBeLessThanOrEqual(280);
      expect(t.endsWith(`(${i + 1}/${n})`)).toBe(true);
    });
  });

  it("uma palavra gigante (sem espaços) é fatiada no limite", () => {
    const giant = "x".repeat(700);
    const out = splitIntoThread(giant, { limit: 280, numbered: false });
    expect(out.length).toBe(3);
    for (const t of out) expect(t.length).toBeLessThanOrEqual(280);
    expect(out.join("")).toBe(giant);
  });

  it("vazio/whitespace retorna lista vazia", () => {
    expect(splitIntoThread("")).toEqual([]);
    expect(splitIntoThread("   \n  ")).toEqual([]);
  });

  it("não numera quando há um único tweet mesmo com numbered=true", () => {
    const out = splitIntoThread("post curtinho", { numbered: true });
    expect(out).toEqual(["post curtinho"]);
  });
});

describe("x-draft — parseDraftJson", () => {
  it("extrai JSON simples", () => {
    expect(parseDraftJson('{"tweets":["a","b"],"kind":"thread"}'))
      .toEqual({ tweets: ["a", "b"], kind: "thread" });
  });

  it("tolera cercas ```json e texto ao redor", () => {
    const raw = "Claro!\n```json\n{\"tweets\":[\"oi\"]}\n```\npronto";
    expect(parseDraftJson(raw)).toEqual({ tweets: ["oi"] });
  });

  it("rejeita ausência de JSON", () => {
    expect(() => parseDraftJson("sem json aqui")).toThrow();
  });

  it("rejeita tweets vazios (zod)", () => {
    expect(() => parseDraftJson('{"tweets":[]}')).toThrow();
  });
});
