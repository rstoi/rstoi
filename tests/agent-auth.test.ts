import { describe, it, expect } from "vitest";
import { parseCsv, isSenderAllowed, isGroupInScope, isAuthorized } from "../src/agent-auth.js";

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
    it("escopo vazio => nenhum grupo confiável (false)", () => {
      expect(isGroupInScope("x@g.us", "Qualquer", [])).toBe(false);
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

  describe("isAuthorized (decisão final, deny por padrão)", () => {
    const GROUPS = ["financeiro setup", "projetos setup"];

    it("autoriza qualquer membro de um grupo escopado (sem allowlist de números)", () => {
      expect(isAuthorized({
        chatId: "120@g.us", groupName: "Financeiro Setup", fromId: "5511000000000",
        groups: GROUPS, senders: [],
      })).toBe(true);
    });
    it("nega grupo fora do escopo", () => {
      expect(isAuthorized({
        chatId: "120@g.us", groupName: "Aleatório", fromId: "5511000000000",
        groups: GROUPS, senders: [],
      })).toBe(false);
    });
    it("nega tudo quando nada está configurado (sem RCE aberta)", () => {
      expect(isAuthorized({
        chatId: "x@g.us", groupName: "Qualquer", fromId: "5511000000000",
        groups: [], senders: [],
      })).toBe(false);
    });
    it("autoriza remetente explícito fora de grupo", () => {
      expect(isAuthorized({
        chatId: "5511999990000@c.us", groupName: "", fromId: "5511999990000",
        groups: GROUPS, senders: ["5511999990000"],
      })).toBe(true);
    });
  });
});
