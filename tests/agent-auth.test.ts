import { describe, it, expect } from "vitest";
import { parseCsv, isSenderAllowed, isGroupInScope } from "../src/agent-auth.js";

describe("agent-auth — autorização do /setup", () => {
  it("parseCsv divide e limpa", () => {
    expect(parseCsv("a, b ,, c")).toEqual(["a", "b", "c"]);
    expect(parseCsv(undefined)).toEqual([]);
  });

  describe("isSenderAllowed (deny por padrão)", () => {
    it("nega quando a allowlist está vazia", () => {
      expect(isSenderAllowed("5511999990000", [])).toBe(false);
    });
    it("nega remetente fora da allowlist", () => {
      expect(isSenderAllowed("5511111112222", ["5511999990000"])).toBe(false);
    });
    it("autoriza remetente da allowlist (tolera formatação)", () => {
      expect(isSenderAllowed("5511999990000@c.us", ["+55 11 99999-0000"])).toBe(true);
    });
    it("nega quando não há remetente", () => {
      expect(isSenderAllowed(undefined, ["5511999990000"])).toBe(false);
    });
  });

  describe("isGroupInScope", () => {
    it("escopo vazio => qualquer chat", () => {
      expect(isGroupInScope("x@g.us", "Qualquer", [])).toBe(true);
    });
    it("casa pelo nome do grupo", () => {
      expect(isGroupInScope("120@g.us", "Financeiro Setup", ["financeiro setup", "projetos setup"])).toBe(true);
      expect(isGroupInScope("120@g.us", "Projetos Setup", ["financeiro setup", "projetos setup"])).toBe(true);
    });
    it("rejeita grupo fora do escopo", () => {
      expect(isGroupInScope("120@g.us", "Aleatório", ["financeiro setup"])).toBe(false);
    });
    it("casa pelo JID", () => {
      expect(isGroupInScope("120363ABC@g.us", "", ["120363ABC@g.us"])).toBe(true);
    });
  });
});
