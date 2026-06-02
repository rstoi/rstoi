#!/usr/bin/env tsx
/**
 * WhatsApp Business MCP — Visual Integration Test
 *
 * Tests every tool, resource, and prompt via the real MCP protocol
 * using an in-memory transport and a realistic mock adapter.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/server.js";
import { WhatsAppAdapter } from "../../src/adapters/base.js";
import { getDb, closeDb } from "../../src/store/db.js";
import type {
  Message, Chat, Group, Contact,
  SendMessageOptions, SentMessage, PaginationOpts,
  GroupUpdate, BusinessProfile, MediaUploadResult,
} from "../../src/types/index.js";

process.env["SQLITE_DB_PATH"] = ":memory:";

// ─── ANSI colours ────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", blue: "\x1b[34m", magenta: "\x1b[35m", white: "\x1b[37m",
  bgBlue: "\x1b[44m", bgGreen: "\x1b[42m", bgRed: "\x1b[41m",
};
const tick  = `${c.green}✓${c.reset}`;
const cross = `${c.red}✗${c.reset}`;
const arrow = `${c.dim}→${c.reset}`;

// ─── Mock data ────────────────────────────────────────────────────────────────
const GROUPS: Group[] = [
  {
    id: "120363001@g.us",
    name: "Tech Team",
    description: "Equipe de tecnologia",
    members: [
      { id: "5511991110001@s.whatsapp.net", name: "Alice", isAdmin: true },
      { id: "5511991110002@s.whatsapp.net", name: "Bob",   isAdmin: false },
      { id: "5511991110003@s.whatsapp.net", name: "Carol", isAdmin: false },
    ],
    createdAt: 1700000000,
  },
  {
    id: "120363002@g.us",
    name: "Família",
    description: "Grupo da família",
    members: [
      { id: "5511991110004@s.whatsapp.net", name: "Pai",  isAdmin: true },
      { id: "5511991110005@s.whatsapp.net", name: "Mãe",  isAdmin: true },
      { id: "5511991110001@s.whatsapp.net", name: "Alice", isAdmin: false },
    ],
    createdAt: 1680000000,
  },
  {
    id: "120363003@g.us",
    name: "Vendas Q4",
    description: "Metas e resultados Q4",
    members: [
      { id: "5511991110006@s.whatsapp.net", name: "Diretor", isAdmin: true },
      { id: "5511991110007@s.whatsapp.net", name: "Vendedor1", isAdmin: false },
    ],
    createdAt: 1710000000,
    inviteLink: "https://chat.whatsapp.com/AbCdEfGhIjK",
  },
];

const CONTACTS: Contact[] = [
  { id: "5511991110001@s.whatsapp.net", name: "Alice Silva",   phone: "5511991110001", pushName: "Alice" },
  { id: "5511991110002@s.whatsapp.net", name: "Bob Santos",    phone: "5511991110002", pushName: "Bob" },
  { id: "5511991110003@s.whatsapp.net", name: "Carol Pereira", phone: "5511991110003", pushName: "Carol" },
  { id: "5511991110004@s.whatsapp.net", name: "Pai",           phone: "5511991110004", statusMessage: "Trabalhando" },
  { id: "5511991110005@s.whatsapp.net", name: "Mãe",           phone: "5511991110005", statusMessage: "🌸" },
];

const MESSAGES: Message[] = [
  { id: "msg001", chatId: "120363001@g.us", fromId: "5511991110001@s.whatsapp.net", fromName: "Alice", type: "text", text: "Bom dia time! Deploy às 14h hoje.", timestamp: Date.now() - 3600_000, isGroup: true, isFromMe: false, status: "read" },
  { id: "msg002", chatId: "120363001@g.us", fromId: "5511991110002@s.whatsapp.net", fromName: "Bob",   type: "text", text: "Certo! Vou preparar o ambiente.", timestamp: Date.now() - 3500_000, isGroup: true, isFromMe: false, status: "read" },
  { id: "msg003", chatId: "120363001@g.us", fromId: "5511991110001@s.whatsapp.net", fromName: "Alice", type: "text", text: "PR aprovado 🎉", timestamp: Date.now() - 1800_000, isGroup: true, isFromMe: false, status: "delivered" },
  { id: "msg004", chatId: "120363002@g.us", fromId: "5511991110004@s.whatsapp.net", fromName: "Pai",   type: "text", text: "Almoço domingo na casa da vó!", timestamp: Date.now() - 86400_000, isGroup: true, isFromMe: false, status: "read" },
  { id: "msg005", chatId: "120363002@g.us", fromId: "5511991110005@s.whatsapp.net", fromName: "Mãe",   type: "text", text: "Vou fazer lasanha 😍", timestamp: Date.now() - 80000_000, isGroup: true, isFromMe: false, status: "read" },
  { id: "msg006", chatId: "5511991110002@s.whatsapp.net", fromId: "5511991110002@s.whatsapp.net", fromName: "Bob", type: "text", text: "Oi! Pode me mandar o link do repo?", timestamp: Date.now() - 600_000, isGroup: false, isFromMe: false, status: "delivered" },
  { id: "msg007", chatId: "5511991110002@s.whatsapp.net", fromId: "me",               type: "text", text: "Claro, mando já!", timestamp: Date.now() - 550_000, isGroup: false, isFromMe: true, status: "read" },
  { id: "msg008", chatId: "120363003@g.us", fromId: "5511991110006@s.whatsapp.net", fromName: "Diretor", type: "text", text: "Meta Q4: R$ 2M. Vamos lá! 🚀", timestamp: Date.now() - 7200_000, isGroup: true, isFromMe: false, status: "read" },
];

// ─── Mock Adapter ─────────────────────────────────────────────────────────────
class MockAdapter extends WhatsAppAdapter {
  private msgs = [...MESSAGES];
  private groups = [...GROUPS];
  private contacts = [...CONTACTS];
  private _connected = true;
  private sentCount = 0;

  connect    = async () => { this._connected = true; };
  disconnect = async () => { this._connected = false; };
  isConnected = () => this._connected;

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    const id = `mock-sent-${++this.sentCount}-${Date.now()}`;
    this.msgs.push({
      id, chatId: to, fromId: "me", type: "text",
      text: opts.text ?? opts.caption ?? "[media]",
      timestamp: Date.now(), isGroup: to.endsWith("@g.us"), isFromMe: true, status: "sent",
    });
    return { id, timestamp: Date.now() };
  }

  async editMessage(messageId: string, _chatId: string, newText: string): Promise<void> {
    const m = this.msgs.find(m => m.id === messageId);
    if (m) m.text = newText;
  }

  async deleteMessage(messageId: string, _chatId: string, _forEveryone = true): Promise<void> {
    this.msgs = this.msgs.filter(m => m.id !== messageId);
  }

  async reactToMessage(_messageId: string, _chatId: string, _emoji: string): Promise<void> {}
  async markAsRead(_chatId: string): Promise<void> {}

  async getMessages(chatId: string, opts: PaginationOpts = {}): Promise<Message[]> {
    return this.msgs
      .filter(m => m.chatId === chatId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, opts.limit ?? 50);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    return this.msgs.find(m => m.id === messageId) ?? null;
  }

  async listChats(): Promise<Chat[]> {
    const chatMap = new Map<string, Message>();
    for (const m of this.msgs) {
      if (!chatMap.has(m.chatId) || m.timestamp > chatMap.get(m.chatId)!.timestamp) {
        chatMap.set(m.chatId, m);
      }
    }
    return [...chatMap.entries()].map(([id, m]) => ({
      id, name: m.isGroup ? (this.groups.find(g => g.id === id)?.name ?? id) : (m.fromName ?? id),
      isGroup: m.isGroup, lastMessageAt: m.timestamp,
    }));
  }

  async listGroups(): Promise<Group[]> { return this.groups; }

  async getGroup(groupId: string): Promise<Group | null> {
    return this.groups.find(g => g.id === groupId) ?? null;
  }

  async createGroup(name: string, participants: string[]): Promise<Group> {
    const group: Group = {
      id: `${Date.now()}@g.us`, name,
      members: participants.map(p => ({ id: p, isAdmin: false })),
    };
    this.groups.push(group);
    return group;
  }

  async updateGroup(groupId: string, updates: GroupUpdate): Promise<void> {
    const g = this.groups.find(g => g.id === groupId);
    if (g) { if (updates.name) g.name = updates.name; if (updates.description) g.description = updates.description; }
  }

  async addGroupMember(groupId: string, phone: string): Promise<void> {
    const g = this.groups.find(g => g.id === groupId);
    if (g) g.members.push({ id: phone, isAdmin: false });
  }

  async removeGroupMember(groupId: string, phone: string): Promise<void> {
    const g = this.groups.find(g => g.id === groupId);
    if (g) g.members = g.members.filter(m => m.id !== phone);
  }

  async promoteGroupMember(groupId: string, phone: string): Promise<void> {
    const g = this.groups.find(g => g.id === groupId);
    const m = g?.members.find(m => m.id === phone);
    if (m) m.isAdmin = true;
  }

  async demoteGroupMember(groupId: string, phone: string): Promise<void> {
    const g = this.groups.find(g => g.id === groupId);
    const m = g?.members.find(m => m.id === phone);
    if (m) m.isAdmin = false;
  }

  async leaveGroup(groupId: string): Promise<void> {
    this.groups = this.groups.filter(g => g.id !== groupId);
  }

  async getGroupInviteLink(groupId: string): Promise<string> {
    return `https://chat.whatsapp.com/MockInvite${groupId.split("@")[0]}`;
  }

  async listContacts(): Promise<Contact[]> { return this.contacts; }

  async getContact(contactId: string): Promise<Contact | null> {
    return this.contacts.find(c => c.id === contactId) ?? null;
  }

  async blockContact(contactId: string): Promise<void> {
    const c = this.contacts.find(c => c.id === contactId);
    if (c) c.isBlocked = true;
  }

  async unblockContact(contactId: string): Promise<void> {
    const c = this.contacts.find(c => c.id === contactId);
    if (c) c.isBlocked = false;
  }

  async uploadMedia(_buf: Buffer, mimeType: string): Promise<MediaUploadResult> {
    return { mediaId: `media-${Date.now()}`, mimeType };
  }

  async downloadMedia(_id: string): Promise<Buffer> {
    return Buffer.from("mock-media-content");
  }

  async getBusinessProfile(): Promise<BusinessProfile> {
    return { id: "5511900000000@s.whatsapp.net", name: "Minha Empresa", phone: "5511900000000", about: "Atendimento 24h" };
  }

  async updateBusinessProfile(_updates: Partial<BusinessProfile>): Promise<void> {}
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results: { category: string; name: string; ok: boolean; detail: string; ms: number }[] = [];

async function run(
  category: string,
  name: string,
  fn: () => Promise<string>,
): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ category, name, ok: true, detail, ms });
    passed++;
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ category, name, ok: false, detail: String(err), ms });
    failed++;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function summary(obj: unknown): string {
  if (Array.isArray(obj)) return `[${obj.length} items]${obj.length > 0 ? ` → ${JSON.stringify(obj[0]).slice(0, 60)}…` : ""}`;
  if (typeof obj === "object" && obj !== null) return JSON.stringify(obj).slice(0, 80);
  return String(obj).slice(0, 80);
}

function pad(s: string, n: number): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, n - plain.length));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Header
  console.log("");
  console.log(`${c.bold}${c.bgBlue}${c.white}  WhatsApp Business MCP — Visual Integration Test  ${c.reset}`);
  console.log("");
  console.log(`  ${c.cyan}Adapter:${c.reset}   MockWhatsAppAdapter (dados sintéticos realistas)`);
  console.log(`  ${c.cyan}Database:${c.reset}  SQLite :memory:`);
  console.log(`  ${c.cyan}Transport:${c.reset} InMemoryTransport (protocolo MCP real)`);
  console.log("");

  // Setup: seed messages into SQLite store so search works
  const db = getDb();
  for (const m of MESSAGES) {
    db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(m.id, m.chatId, m.fromId, m.fromName ?? null, m.type, m.text ?? null,
           m.timestamp, m.isGroup ? 1 : 0, m.isFromMe ? 1 : 0, m.status ?? "sent");
  }
  for (const g of GROUPS) {
    db.prepare(`INSERT OR REPLACE INTO groups (id, name, description, members) VALUES (?, ?, ?, ?)`)
      .run(g.id, g.name, g.description ?? null, JSON.stringify(g.members));
  }
  for (const c_ of CONTACTS) {
    db.prepare(`INSERT OR REPLACE INTO contacts (id, name, push_name, phone) VALUES (?, ?, ?, ?)`)
      .run(c_.id, c_.name ?? null, c_.pushName ?? null, c_.phone);
  }

  // Create MCP server + client via in-memory transport
  const adapter = new MockAdapter();
  const server = createMcpServer(adapter);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "visual-test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // ── 0. Discovery ────────────────────────────────────────────────────────────
  const toolsList = await client.listTools();
  const resourcesList = await client.listResources();
  const resourceTemplates = await client.listResourceTemplates();
  const promptsList = await client.listPrompts();

  console.log(`${c.bold}${c.yellow}  DISCOVERY${c.reset}`);
  const totalResources = resourcesList.resources.length + resourceTemplates.resourceTemplates.length;
  console.log(`  ${tick} Tools registradas:    ${c.bold}${toolsList.tools.length}${c.reset}`);
  console.log(`  ${tick} Resources registradas: ${c.bold}${totalResources}${c.reset} (${resourcesList.resources.length} estáticas + ${resourceTemplates.resourceTemplates.length} templates)`);
  console.log(`  ${tick} Prompts registradas:   ${c.bold}${promptsList.prompts.length}${c.reset}`);
  console.log("");

  // ── 1. Messaging Tools ──────────────────────────────────────────────────────
  await run("Messaging", "send_message (texto grupo)", async () => {
    const r = await client.callTool({ name: "send_message", arguments: { to: "120363001@g.us", text: "Olá, Time Tech! 👋" } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Messaging", "send_message (texto DM)", async () => {
    const r = await client.callTool({ name: "send_message", arguments: { to: "5511991110002@s.whatsapp.net", text: "Aqui está o link do repo: github.com/..." } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Messaging", "send_message (imagem URL)", async () => {
    const r = await client.callTool({ name: "send_message", arguments: { to: "120363001@g.us", media_url: "https://example.com/deploy-chart.png", media_type: "image", caption: "Resultado do deploy 🚀" } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Messaging", "reply_message", async () => {
    const r = await client.callTool({ name: "reply_message", arguments: { to: "120363001@g.us", quoted_message_id: "msg001", text: "Confirmado! 👍" } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Messaging", "edit_message", async () => {
    const r = await client.callTool({ name: "edit_message", arguments: { message_id: "msg007", chat_id: "5511991110002@s.whatsapp.net", new_text: "Claro! Aqui o link: github.com/org/repo" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Messaging", "delete_message", async () => {
    // Send a message to delete
    const sent = await client.callTool({ name: "send_message", arguments: { to: "120363003@g.us", text: "mensagem para deletar" } });
    const sentId = JSON.parse((sent.content as {type: string; text: string}[])[0].text).id;
    const r = await client.callTool({ name: "delete_message", arguments: { message_id: sentId, chat_id: "120363003@g.us", for_everyone: true } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Messaging", "react_to_message", async () => {
    const r = await client.callTool({ name: "react_to_message", arguments: { message_id: "msg003", chat_id: "120363001@g.us", emoji: "🎉" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Messaging", "forward_message", async () => {
    const r = await client.callTool({ name: "forward_message", arguments: { message_id: "msg001", to: "120363002@g.us" } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Messaging", "mark_as_read", async () => {
    const r = await client.callTool({ name: "mark_as_read", arguments: { chat_id: "120363001@g.us" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Messaging", "get_messages", async () => {
    const r = await client.callTool({ name: "get_messages", arguments: { chat_id: "120363001@g.us", limit: 10 } });
    const msgs = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return summary(msgs);
  });

  await run("Messaging", "get_message", async () => {
    const r = await client.callTool({ name: "get_message", arguments: { message_id: "msg001" } });
    const m = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `"${m.text?.slice(0, 40)}"`;
  });

  await run("Messaging", "search_messages", async () => {
    const r = await client.callTool({ name: "search_messages", arguments: { query: "deploy", limit: 5 } });
    const rows = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `${rows.length} resultado(s)`;
  });

  await run("Messaging", "list_conversations", async () => {
    const r = await client.callTool({ name: "list_conversations", arguments: { limit: 20 } });
    const chats = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return summary(chats);
  });

  // ── 2. Group Tools ──────────────────────────────────────────────────────────
  await run("Groups", "list_groups", async () => {
    const r = await client.callTool({ name: "list_groups", arguments: {} });
    const gs = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `${gs.length} grupos: ${gs.map((g: Group) => g.name).join(", ")}`;
  });

  await run("Groups", "get_group", async () => {
    const r = await client.callTool({ name: "get_group", arguments: { group_id: "120363001@g.us" } });
    const g = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `"${g.name}" (${g.members.length} membros)`;
  });

  await run("Groups", "create_group", async () => {
    const r = await client.callTool({ name: "create_group", arguments: { name: "Novo Projeto 2026", participants: ["5511991110001@s.whatsapp.net", "5511991110002@s.whatsapp.net"] } });
    const g = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${g.id}, name="${g.name}"`;
  });

  await run("Groups", "update_group", async () => {
    const r = await client.callTool({ name: "update_group", arguments: { group_id: "120363001@g.us", description: "Equipe principal de engenharia" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Groups", "add_group_member", async () => {
    const r = await client.callTool({ name: "add_group_member", arguments: { group_id: "120363001@g.us", phone: "5511991110009@s.whatsapp.net" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Groups", "remove_group_member", async () => {
    const r = await client.callTool({ name: "remove_group_member", arguments: { group_id: "120363001@g.us", phone: "5511991110009@s.whatsapp.net" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Groups", "promote_group_member", async () => {
    const r = await client.callTool({ name: "promote_group_member", arguments: { group_id: "120363001@g.us", phone: "5511991110002@s.whatsapp.net" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Groups", "demote_group_member", async () => {
    const r = await client.callTool({ name: "demote_group_member", arguments: { group_id: "120363001@g.us", phone: "5511991110002@s.whatsapp.net" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Groups", "get_group_invite_link", async () => {
    const r = await client.callTool({ name: "get_group_invite_link", arguments: { group_id: "120363001@g.us" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Groups", "leave_group (grupo clone)", async () => {
    // Create a temp group then leave it
    const created = await client.callTool({ name: "create_group", arguments: { name: "Temp Group", participants: ["5511991110001@s.whatsapp.net"] } });
    const g = JSON.parse((created.content as {type: string; text: string}[])[0].text);
    const r = await client.callTool({ name: "leave_group", arguments: { group_id: g.id } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  // ── 3. Contact Tools ────────────────────────────────────────────────────────
  await run("Contacts", "list_contacts", async () => {
    const r = await client.callTool({ name: "list_contacts", arguments: { limit: 10 } });
    const cs = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `${cs.length} contatos: ${cs.map((c_: Contact) => c_.name).join(", ")}`;
  });

  await run("Contacts", "get_contact", async () => {
    const r = await client.callTool({ name: "get_contact", arguments: { contact_id: "5511991110001@s.whatsapp.net" } });
    const c_ = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `"${c_.name}" (${c_.phone})`;
  });

  await run("Contacts", "block_contact", async () => {
    const r = await client.callTool({ name: "block_contact", arguments: { contact_id: "5511991110003@s.whatsapp.net" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  await run("Contacts", "unblock_contact", async () => {
    const r = await client.callTool({ name: "unblock_contact", arguments: { contact_id: "5511991110003@s.whatsapp.net" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  // ── 4. Media & Profile Tools ────────────────────────────────────────────────
  await run("Media", "send_media (URL imagem)", async () => {
    const r = await client.callTool({ name: "send_media", arguments: { to: "120363001@g.us", media_type: "image", source: "https://example.com/grafico.png", caption: "Gráfico de performance" } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Media", "get_profile", async () => {
    const r = await client.callTool({ name: "get_profile", arguments: {} });
    const p = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `"${p.name}" (${p.phone})`;
  });

  await run("Media", "update_profile", async () => {
    const r = await client.callTool({ name: "update_profile", arguments: { name: "Minha Empresa LTDA", about: "Suporte 24/7 ⚡" } });
    return (r.content as {type: string; text: string}[])[0].text;
  });

  // ── 5. Resources ────────────────────────────────────────────────────────────
  await run("Resources", "whatsapp://conversations", async () => {
    const r = await client.readResource({ uri: "whatsapp://conversations" });
    const data = JSON.parse(r.contents[0].text as string);
    return `${data.length} conversa(s)`;
  });

  await run("Resources", "whatsapp://conversation/{chatId}", async () => {
    const r = await client.readResource({ uri: "whatsapp://conversation/120363001@g.us" });
    const data = JSON.parse(r.contents[0].text as string);
    return `chatId=${data.chatId}, ${data.messages.length} mensagem(ns)`;
  });

  await run("Resources", "whatsapp://groups", async () => {
    const r = await client.readResource({ uri: "whatsapp://groups" });
    const data = JSON.parse(r.contents[0].text as string);
    return `${data.length} grupo(s): ${data.map((g: Group) => g.name).join(", ")}`;
  });

  await run("Resources", "whatsapp://group/{groupId}", async () => {
    const r = await client.readResource({ uri: "whatsapp://group/120363002@g.us" });
    const g = JSON.parse(r.contents[0].text as string);
    return `"${g.name}" (${g.members.length} membros)`;
  });

  await run("Resources", "whatsapp://contacts", async () => {
    const r = await client.readResource({ uri: "whatsapp://contacts" });
    const data = JSON.parse(r.contents[0].text as string);
    return `${data.length} contato(s)`;
  });

  await run("Resources", "whatsapp://contact/{contactId}", async () => {
    const r = await client.readResource({ uri: "whatsapp://contact/5511991110004@s.whatsapp.net" });
    const c_ = JSON.parse(r.contents[0].text as string);
    return `"${c_?.name}" (${c_?.phone})`;
  });

  // ── 6. Prompts ──────────────────────────────────────────────────────────────
  await run("Prompts", "draft_message", async () => {
    const r = await client.getPrompt({ name: "draft_message", arguments: { topic: "lançamento do produto", tone: "professional", recipient_type: "group" } });
    return `${r.messages.length} mensagem(ns) no prompt`;
  });

  await run("Prompts", "summarize_conversation", async () => {
    const r = await client.getPrompt({ name: "summarize_conversation", arguments: { messages_json: JSON.stringify(MESSAGES.slice(0, 3)) } });
    return `${r.messages.length} mensagem(ns) no prompt`;
  });

  await run("Prompts", "analyze_group", async () => {
    const r = await client.getPrompt({ name: "analyze_group", arguments: { group_json: JSON.stringify(GROUPS[0]), messages_json: JSON.stringify(MESSAGES.slice(0, 3)) } });
    return `${r.messages.length} mensagem(ns) no prompt`;
  });

  // ── 7. Edge cases ───────────────────────────────────────────────────────────
  await run("Edge Cases", "get_messages (with time filter)", async () => {
    const r = await client.callTool({ name: "get_messages", arguments: { chat_id: "120363001@g.us", limit: 5, after: Date.now() - 7200_000 } });
    const msgs = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `${msgs.length} mensagem(ns) nas últimas 2h`;
  });

  await run("Edge Cases", "search_messages (grupo específico)", async () => {
    const r = await client.callTool({ name: "search_messages", arguments: { query: "lasanha", chat_id: "120363002@g.us", limit: 5 } });
    const rows = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `${rows.length} resultado(s) para "lasanha"`;
  });

  await run("Edge Cases", "send_message (document via URL)", async () => {
    const r = await client.callTool({ name: "send_message", arguments: { to: "5511991110002@s.whatsapp.net", media_url: "https://example.com/relatorio.pdf", media_type: "document", file_name: "relatorio-q4.pdf", caption: "Relatório Q4" } });
    const d = JSON.parse((r.content as {type: string; text: string}[])[0].text);
    return `id=${d.id}`;
  });

  await run("Edge Cases", "get_message (not found → isError)", async () => {
    const r = await client.callTool({ name: "get_message", arguments: { message_id: "nonexistent-id" } });
    // MCP tools return errors as content with isError:true
    if (r.isError) return "retornou isError=true corretamente";
    // Some SDK versions embed the error in content text
    const text = (r.content as {type: string; text: string}[])[0]?.text ?? "";
    if (text.includes("not found")) return "retornou erro no conteúdo corretamente";
    throw new Error(`esperava erro mas recebeu: ${text.slice(0, 60)}`);
  });

  // ── Print results ────────────────────────────────────────────────────────────
  console.log(`${c.bold}─────────────────────────────────────────────────────────────────${c.reset}`);

  let lastCat = "";
  for (const r of results) {
    if (r.category !== lastCat) {
      lastCat = r.category;
      console.log(`\n${c.bold}${c.yellow}  ${r.category.toUpperCase()}${c.reset}`);
    }
    const icon = r.ok ? tick : cross;
    const ms = `${c.dim}${r.ms}ms${c.reset}`;
    const name = pad(`${c.cyan}${r.name}${c.reset}`, 45);
    const detail = r.ok ? `${c.dim}${r.detail.slice(0, 70)}${c.reset}` : `${c.red}${r.detail.slice(0, 70)}${c.reset}`;
    console.log(`  ${icon} ${name} ${arrow} ${detail}  ${ms}`);
  }

  // ── Final summary ────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log("");
  console.log(`${c.bold}─────────────────────────────────────────────────────────────────${c.reset}`);
  console.log("");

  if (failed === 0) {
    console.log(`  ${c.bold}${c.bgGreen}${c.white}  TUDO PASSOU  ${c.reset}  ${c.green}${passed}/${total} testes${c.reset}`);
  } else {
    console.log(`  ${c.bold}${c.bgRed}${c.white}  FALHAS DETECTADAS  ${c.reset}  ${c.green}${passed} OK${c.reset}  ${c.red}${failed} FALHOU${c.reset}  de ${total}`);
  }

  console.log("");
  console.log(`  ${c.cyan}Tools registradas:${c.reset}     ${toolsList.tools.length} (esperado: 27+)`);
  console.log(`  ${c.cyan}Resources registradas:${c.reset}  ${totalResources} (esperado: 6)`);
  console.log(`  ${c.cyan}Prompts registradas:${c.reset}   ${promptsList.prompts.length} (esperado: 3)`);
  console.log(`  ${c.cyan}Mensagens na store:${c.reset}    ${MESSAGES.length} seed + ${passed >= 1 ? "múltiplas enviadas" : "n/a"}`);
  console.log("");

  // List all tools
  console.log(`${c.bold}${c.yellow}  TOOLS DISPONÍVEIS:${c.reset}`);
  const toolNames = toolsList.tools.map(t => t.name);
  for (let i = 0; i < toolNames.length; i += 4) {
    const slice = toolNames.slice(i, i + 4).map(n => pad(`${c.dim}${n}${c.reset}`, 30)).join("");
    console.log(`  ${slice}`);
  }
  console.log("");

  closeDb();
  await client.close();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${c.red}[FATAL]${c.reset}`, e);
  process.exit(1);
});
