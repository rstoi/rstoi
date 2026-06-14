import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { guardAdapter, getBlockedGroups, getBlockedChatIds } from "../src/guard.js";
import type { WhatsAppAdapter } from "../src/adapters/base.js";

const BLOCKED_JID = "120363000000000000@g.us";
const ALLOWED_JID = "120363111111111111@g.us";

function fakeAdapter(): WhatsAppAdapter {
  const a: Partial<WhatsAppAdapter> = {
    sendMessage: vi.fn(async () => ({ id: "x", chatId: "x", timestamp: 0 } as any)),
    getMessages: vi.fn(async () => []),
    leaveGroup: vi.fn(async () => {}),
    getGroup: vi.fn(async (id: string) =>
      id === BLOCKED_JID
        ? ({ id, name: "FinancasFacil", participants: [] } as any)
        : ({ id, name: "Equipe Comercial", participants: [] } as any),
    ),
    listGroups: vi.fn(async () => [
      { id: BLOCKED_JID, name: "FinancasFacil", participants: [] } as any,
      { id: ALLOWED_JID, name: "Equipe Comercial", participants: [] } as any,
    ]),
    listChats: vi.fn(async () => [
      { id: BLOCKED_JID, name: "FinancasFacil", isGroup: true } as any,
      { id: ALLOWED_JID, name: "Equipe Comercial", isGroup: true } as any,
    ]),
  };
  return a as WhatsAppAdapter;
}

describe("guardAdapter (WA_BLOCKED_GROUPS)", () => {
  const prev = process.env.WA_BLOCKED_GROUPS;
  beforeEach(() => {
    process.env.WA_BLOCKED_GROUPS = "financasfacil";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.WA_BLOCKED_GROUPS;
    else process.env.WA_BLOCKED_GROUPS = prev;
  });

  it("lê a lista de bloqueio do ambiente", () => {
    expect(getBlockedGroups()).toContain("financasfacil");
  });

  it("bloqueia envio para o grupo (resolvendo o nome pelo JID)", async () => {
    const g = guardAdapter(fakeAdapter());
    await expect(g.sendMessage(BLOCKED_JID, { text: "oi" } as any)).rejects.toThrow(/bloqueada/i);
  });

  it("bloqueia leitura/monitoramento (getMessages) do grupo", async () => {
    const g = guardAdapter(fakeAdapter());
    await expect(g.getMessages(BLOCKED_JID)).rejects.toThrow(/bloqueada/i);
  });

  it("permite operações em grupos não bloqueados", async () => {
    const g = guardAdapter(fakeAdapter());
    await expect(g.getMessages(ALLOWED_JID)).resolves.toEqual([]);
    await expect(g.sendMessage(ALLOWED_JID, { text: "oi" } as any)).resolves.toBeTruthy();
  });

  it("filtra o grupo bloqueado das listagens", async () => {
    const g = guardAdapter(fakeAdapter());
    const groups = await g.listGroups();
    expect(groups.map((x) => x.id)).toEqual([ALLOWED_JID]);
    const chats = await g.listChats();
    expect(chats.map((x) => x.id)).toEqual([ALLOWED_JID]);
  });

  it("não monitora mensagens recebidas do grupo bloqueado (onMessage)", async () => {
    const g = guardAdapter(fakeAdapter());
    const received: string[] = [];
    g.onMessage = (m) => received.push(m.chatId);
    // mensagem do grupo bloqueado é descartada; do permitido passa
    (g.onMessage as (m: any) => void)({ chatId: BLOCKED_JID, isGroup: true });
    (g.onMessage as (m: any) => void)({ chatId: ALLOWED_JID, isGroup: true });
    await new Promise((r) => setTimeout(r, 20)); // aguarda resolução assíncrona do nome
    expect(received).not.toContain(BLOCKED_JID);
    expect(received).toContain(ALLOWED_JID);
  });

  it("sem WA_BLOCKED_GROUPS, devolve o adaptador original (sem overhead)", () => {
    delete process.env.WA_BLOCKED_GROUPS;
    const raw = fakeAdapter();
    expect(guardAdapter(raw)).toBe(raw);
  });

  it("getBlockedChatIds resolve o JID do grupo bloqueado via tabela groups", () => {
    const db = {
      prepare: () => ({
        all: () => [
          { id: BLOCKED_JID, name: "FinancasFacil" },
          { id: ALLOWED_JID, name: "Equipe Comercial" },
        ],
      }),
    };
    const ids = getBlockedChatIds(db);
    expect(ids.has(BLOCKED_JID)).toBe(true);
    expect(ids.has(ALLOWED_JID)).toBe(false);
  });
});
