import { describe, it, expect } from "vitest";
import { buildCioSystemPrompt, buildCioUserPrompt } from "../../src/cio/summary.js";
import type { Situacao } from "../../src/cio/collect-status.js";

const SITUACAO: Situacao = {
  ts: "2026-07-01T08:00:00.000Z",
  git: { branch: "main", clean: true, lastCommit: "fix: coisa", lastCommitTime: "2 hours ago" },
  testes: { pass: 48, fail: 0 },
  recursos: { ramPct: 42, discoPct: 61 },
  rede: [
    { host: "github.com", ok: true },
    { host: "graph.facebook.com", ok: false },
  ],
  whatsapp: { adapter: "baileys", mensagens: 120, contatos: 15 },
  pendencias: ["Rede: graph.facebook.com inacessível"],
};

describe("cio/summary — prompts do Agente CIO", () => {
  it("system prompt define a persona de CIO AI-first em português", () => {
    const prompt = buildCioSystemPrompt();
    expect(prompt).toMatch(/CIO/);
    expect(prompt).toMatch(/AI-first/i);
    expect(prompt).toMatch(/português/i);
    expect(prompt).toMatch(/Recomendação do CIO/);
  });

  it("system prompt pede para não inventar fatos", () => {
    expect(buildCioSystemPrompt()).toMatch(/nunca invente/i);
  });

  it("user prompt inclui os principais sinais coletados", () => {
    const prompt = buildCioUserPrompt(SITUACAO);
    expect(prompt).toContain("main");
    expect(prompt).toContain("48 passando, 0 falhando");
    expect(prompt).toContain("RAM em 42%");
    expect(prompt).toContain("disco em 61%");
    expect(prompt).toContain("github.com OK");
    expect(prompt).toContain("graph.facebook.com falha");
    expect(prompt).toContain("baileys");
    expect(prompt).toContain("120 mensagens e 15 contatos");
    expect(prompt).toContain("Rede: graph.facebook.com inacessível");
  });

  it("user prompt sinaliza quando não há pendências", () => {
    const semPendencias: Situacao = { ...SITUACAO, pendencias: [] };
    expect(buildCioUserPrompt(semPendencias)).toContain("nenhuma");
  });

  it("user prompt sinaliza working tree com mudanças pendentes", () => {
    const sujo: Situacao = { ...SITUACAO, git: { ...SITUACAO.git, clean: false } };
    expect(buildCioUserPrompt(sujo)).toContain("com mudanças pendentes");
  });
});
