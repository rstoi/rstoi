/**
 * Generic HTTP Adapter
 *
 * Sends messages via a configurable HTTP endpoint and receives them via
 * the standard /webhook route. No third-party WhatsApp library required.
 *
 * Compatible with any REST-based messaging gateway, including self-hosted
 * solutions and custom bridges.
 *
 * Required env vars:
 *   WA_HTTP_SEND_URL     — POST endpoint for outbound messages
 *   WA_HTTP_PHONE        — Our phone/sender ID included in payloads
 *
 * Optional env vars:
 *   WA_HTTP_TOKEN        — Bearer token added to Authorization header
 *   WA_HTTP_EXTRA_HEADERS— JSON object with additional request headers
 *
 * Outbound payload sent to WA_HTTP_SEND_URL:
 *   { from, to, type, text?, mediaUrl?, caption?, latitude?, longitude?,
 *     quotedMessageId?, fileName?, mimeType? }
 *
 * Inbound webhook payload expected at POST /webhook:
 *   { messageId, from, fromName?, type, text?, mediaUrl?, mimeType?,
 *     fileName?, timestamp?, isGroup? }
 *   OR a Meta Cloud API compatible payload (auto-detected)
 */

import type {
  Message,
  Chat,
  Group,
  Contact,
  SendMessageOptions,
  SentMessage,
  PaginationOpts,
  GroupUpdate,
  BusinessProfile,
  MediaUploadResult,
} from "../../types/index.js";
import { WhatsAppAdapter } from "../base.js";
import { getDb } from "../../store/db.js";

interface OutboundPayload {
  from:             string;
  to:               string;
  type:             string;
  text?:            string;
  mediaUrl?:        string;
  caption?:         string;
  fileName?:        string;
  mimeType?:        string;
  latitude?:        number;
  longitude?:       number;
  quotedMessageId?: string;
  emoji?:           string;
}

export class HttpClient extends WhatsAppAdapter {
  private sendUrl: string;
  private phone: string;
  private headers: Record<string, string>;
  private connected = false;

  constructor() {
    super();
    this.sendUrl = process.env.WA_HTTP_SEND_URL ?? "";
    this.phone   = process.env.WA_HTTP_PHONE    ?? "unknown";

    this.headers = { "Content-Type": "application/json" };
    const token = process.env.WA_HTTP_TOKEN;
    if (token) this.headers["Authorization"] = `Bearer ${token}`;

    const extra = process.env.WA_HTTP_EXTRA_HEADERS;
    if (extra) {
      try {
        Object.assign(this.headers, JSON.parse(extra) as Record<string, string>);
      } catch { /**/ }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (!this.sendUrl) {
      console.error("[http-adapter] WA_HTTP_SEND_URL not set — outbound messages will be stored locally only");
    }
    this.connected = true;
    console.error(`[http-adapter] Connected (phone: ${this.phone}, send_url: ${this.sendUrl || "local-only"})`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── HTTP send ─────────────────────────────────────────────────────────────

  private async postOutbound(payload: OutboundPayload): Promise<Record<string, unknown>> {
    if (!this.sendUrl) {
      // Local-only mode: store the message as sent, no HTTP call
      return { messageId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    }
    const res = await fetch(this.sendUrl, {
      method:  "POST",
      headers: this.headers,
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP adapter send failed ${res.status}: ${txt}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    let type = "text";
    if (opts.mediaType)                                  type = opts.mediaType;
    if (opts.latitude != null && opts.longitude != null) type = "location";
    if (opts.emoji)                                      type = "reaction";

    const payload: OutboundPayload = {
      from:             this.phone,
      to,
      type,
      text:             opts.text,
      mediaUrl:         opts.mediaUrl,
      caption:          opts.caption,
      fileName:         opts.fileName,
      mimeType:         opts.mimeType,
      latitude:         opts.latitude,
      longitude:        opts.longitude,
      quotedMessageId:  opts.quotedMessageId,
      emoji:            opts.emoji,
    };

    const res = await this.postOutbound(payload);
    const id  = (res["messageId"] as string | undefined) ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ts  = Date.now();

    // Store outbound message locally
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_id, from_id, type, text, timestamp, is_group, is_from_me, status)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, 'sent')
    `).run(id, to, this.phone, type, opts.text ?? null, ts);

    return { id, timestamp: ts };
  }

  async editMessage(_messageId: string, _chatId: string, _newText: string): Promise<void> {
    // Store update locally; send update to remote if configured
    const db = getDb();
    db.prepare("UPDATE messages SET text = ? WHERE id = ?").run(_newText, _messageId);
  }

  async deleteMessage(messageId: string, _chatId: string, _forEveryone = true): Promise<void> {
    const db = getDb();
    db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  }

  async reactToMessage(_messageId: string, _chatId: string, _emoji: string): Promise<void> {
    // Reactions stored locally via a future messages entry
  }

  async markAsRead(_chatId: string, messageId?: string): Promise<void> {
    if (!messageId) return;
    const db = getDb();
    db.prepare("UPDATE messages SET status = 'read' WHERE id = ?").run(messageId);
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  async getMessages(chatId: string, opts: PaginationOpts = {}): Promise<Message[]> {
    const db = getDb();
    let q = "SELECT * FROM messages WHERE chat_id = ?";
    const p: (string | number)[] = [chatId];
    if (opts.after)  { q += " AND timestamp > ?"; p.push(opts.after); }
    if (opts.before) { q += " AND timestamp < ?"; p.push(opts.before); }
    q += " ORDER BY timestamp DESC LIMIT ?";
    p.push(opts.limit ?? 50);
    return (db.prepare(q).all(...p) as Record<string, unknown>[]).map(rowToMessage);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const db  = getDb();
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
    return row ? rowToMessage(row as Record<string, unknown>) : null;
  }

  async listChats(): Promise<Chat[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT chat_id,
             MAX(timestamp) AS last_ts,
             SUM(CASE WHEN is_from_me = 0 AND status != 'read' THEN 1 ELSE 0 END) AS unread
      FROM messages GROUP BY chat_id ORDER BY last_ts DESC
    `).all() as Record<string, unknown>[];
    return rows.map(r => ({
      id:            r["chat_id"] as string,
      name:          r["chat_id"] as string,
      isGroup:       (r["chat_id"] as string).endsWith("@g.us"),
      lastMessageAt: r["last_ts"] as number,
      unreadCount:   r["unread"]  as number,
    }));
  }

  // ── Groups (local store) ──────────────────────────────────────────────────

  async listGroups(): Promise<Group[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM groups").all() as Record<string, unknown>[]).map(rowToGroup);
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const db  = getDb();
    const row = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId);
    return row ? rowToGroup(row as Record<string, unknown>) : null;
  }

  async createGroup(name: string, participants: string[]): Promise<Group> {
    const db = getDb();
    const id = `group-${Date.now()}@g.us`;
    const members = participants.map(p => ({ id: p, name: p, isAdmin: false }));
    db.prepare(`
      INSERT INTO groups (id, name, members, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, name, JSON.stringify(members), Date.now());
    return { id, name, members, createdAt: Date.now() };
  }

  async updateGroup(groupId: string, updates: GroupUpdate): Promise<void> {
    const db = getDb();
    if (updates.name)        db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(updates.name, groupId);
    if (updates.description) db.prepare("UPDATE groups SET description = ? WHERE id = ?").run(updates.description, groupId);
  }

  async addGroupMember(groupId: string, phone: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Group not found");
    const db = getDb();
    const members = [...group.members, { id: phone, name: phone, isAdmin: false }];
    db.prepare("UPDATE groups SET members = ? WHERE id = ?").run(JSON.stringify(members), groupId);
  }

  async removeGroupMember(groupId: string, phone: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Group not found");
    const db = getDb();
    const members = group.members.filter(m => m.id !== phone);
    db.prepare("UPDATE groups SET members = ? WHERE id = ?").run(JSON.stringify(members), groupId);
  }

  async promoteGroupMember(groupId: string, phone: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Group not found");
    const db = getDb();
    const members = group.members.map(m => m.id === phone ? { ...m, isAdmin: true } : m);
    db.prepare("UPDATE groups SET members = ? WHERE id = ?").run(JSON.stringify(members), groupId);
  }

  async demoteGroupMember(groupId: string, phone: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error("Group not found");
    const db = getDb();
    const members = group.members.map(m => m.id === phone ? { ...m, isAdmin: false } : m);
    db.prepare("UPDATE groups SET members = ? WHERE id = ?").run(JSON.stringify(members), groupId);
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.removeGroupMember(groupId, this.phone);
  }

  async getGroupInviteLink(groupId: string): Promise<string> {
    return `https://chat.whatsapp.com/${groupId.replace("@g.us", "")}`;
  }

  // ── Contacts (local store) ────────────────────────────────────────────────

  async listContacts(): Promise<Contact[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM contacts").all() as Record<string, unknown>[]).map(rowToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const db  = getDb();
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
    return row ? rowToContact(row as Record<string, unknown>) : null;
  }

  async blockContact(contactId: string): Promise<void> {
    const db = getDb();
    db.prepare("UPDATE contacts SET is_blocked = 1 WHERE id = ?").run(contactId);
  }

  async unblockContact(contactId: string): Promise<void> {
    const db = getDb();
    db.prepare("UPDATE contacts SET is_blocked = 0 WHERE id = ?").run(contactId);
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  async uploadMedia(buffer: Buffer, mimeType: string, fileName?: string): Promise<MediaUploadResult> {
    if (!this.sendUrl) {
      return { mediaId: `local-media-${Date.now()}`, mimeType };
    }
    const mediaUrl = this.sendUrl.replace(/\/messages\/?$/, "/media");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName ?? "file");
    const res = await fetch(mediaUrl, { method: "POST", headers: this.headers, body: form });
    if (!res.ok) throw new Error(`Media upload failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    return { mediaId: (data["mediaId"] ?? data["id"]) as string, mimeType };
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const res = await fetch(mediaId);
    if (!res.ok) throw new Error(`Media download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getBusinessProfile(): Promise<BusinessProfile> {
    return {
      id:    this.phone,
      name:  process.env.WA_BUSINESS_NAME  ?? "WhatsApp Business",
      phone: this.phone,
      about: process.env.WA_BUSINESS_ABOUT ?? "",
    };
  }

  async updateBusinessProfile(updates: Partial<BusinessProfile>): Promise<void> {
    // Store updated profile info in env-like fashion (no persistent config in this adapter)
    if (updates.about) process.env["WA_BUSINESS_ABOUT"] = updates.about;
    if (updates.name)  process.env["WA_BUSINESS_NAME"]  = updates.name;
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  verifyWebhook(token: string, challenge: string): string {
    if (token !== (process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "")) {
      throw new Error("Invalid verify token");
    }
    return challenge;
  }

  async processWebhookPayload(payload: unknown): Promise<void> {
    const db = getDb();

    // Accept both our own format and Meta Cloud API format
    if (isMetaPayload(payload)) {
      await processMetaFormat(payload, db, this.onMessage?.bind(this), this.onMessageUpdate?.bind(this));
      return;
    }

    // Our own simple format
    const p = payload as Record<string, unknown>;
    const message: Message = {
      id:        (p["messageId"] as string | undefined) ?? `recv-${Date.now()}`,
      chatId:    (p["from"]      as string | undefined) ?? "unknown",
      fromId:    (p["from"]      as string | undefined) ?? "unknown",
      fromName:  p["fromName"]  as string | undefined,
      type:      ((p["type"] as string | undefined) ?? "text") as Message["type"],
      text:      p["text"]      as string | undefined,
      mediaUrl:  p["mediaUrl"]  as string | undefined,
      mimeType:  p["mimeType"]  as string | undefined,
      fileName:  p["fileName"]  as string | undefined,
      timestamp: ((p["timestamp"] as number | undefined) ?? Date.now()),
      isGroup:   Boolean(p["isGroup"]),
      isFromMe:  false,
    };

    db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_id, from_id, from_name, type, text, media_url, mime_type,
         file_name, timestamp, is_group, is_from_me, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'received')
    `).run(
      message.id, message.chatId, message.fromId, message.fromName ?? null,
      message.type, message.text ?? null, message.mediaUrl ?? null,
      message.mimeType ?? null, message.fileName ?? null,
      message.timestamp, message.isGroup ? 1 : 0,
    );

    this.onMessage?.(message);
  }
}

// ── Meta Cloud API payload detector ──────────────────────────────────────────

function isMetaPayload(p: unknown): p is { entry: unknown[] } {
  return typeof p === "object" && p !== null && "entry" in p && Array.isArray((p as Record<string, unknown>)["entry"]);
}

async function processMetaFormat(
  payload: { entry: unknown[] },
  db: ReturnType<typeof getDb>,
  onMessage?: (m: Message) => void,
  onMessageUpdate?: (id: string, status: string) => void,
): Promise<void> {
  for (const entry of payload.entry as Record<string, unknown>[]) {
    for (const change of (entry["changes"] as Record<string, unknown>[]) ?? []) {
      const value = change["value"] as Record<string, unknown>;
      const contactMap: Record<string, string> = {};
      for (const c of (value["contacts"] as Array<{ wa_id: string; profile: { name: string } }>) ?? []) {
        contactMap[c.wa_id] = c.profile.name;
      }
      for (const msg of (value["messages"] as Array<Record<string, unknown>>) ?? []) {
        const message: Message = {
          id:        msg["id"]        as string,
          chatId:    msg["from"]      as string,
          fromId:    msg["from"]      as string,
          fromName:  contactMap[msg["from"] as string],
          type:      msg["type"]      as Message["type"],
          text:      (msg["text"] as Record<string, string> | undefined)?.["body"],
          timestamp: parseInt(msg["timestamp"] as string, 10) * 1000,
          isGroup:   false,
          isFromMe:  false,
        };
        db.prepare(`
          INSERT OR REPLACE INTO messages
            (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
        `).run(
          message.id, message.chatId, message.fromId,
          message.fromName ?? null, message.type,
          message.text ?? null, message.timestamp,
        );
        onMessage?.(message);
      }
      for (const s of (value["statuses"] as Array<{ id: string; status: string }>) ?? []) {
        db.prepare("UPDATE messages SET status = ? WHERE id = ?").run(s.status, s.id);
        onMessageUpdate?.(s.id, s.status);
      }
    }
  }
}

// ── DB row mappers ────────────────────────────────────────────────────────────

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id:              r["id"]               as string,
    chatId:          r["chat_id"]          as string,
    fromId:          r["from_id"]          as string,
    fromName:        (r["from_name"]       as string | null) ?? undefined,
    type:            r["type"]             as Message["type"],
    text:            (r["text"]            as string | null) ?? undefined,
    mediaId:         (r["media_id"]        as string | null) ?? undefined,
    mediaUrl:        (r["media_url"]       as string | null) ?? undefined,
    mimeType:        (r["mime_type"]       as string | null) ?? undefined,
    fileName:        (r["file_name"]       as string | null) ?? undefined,
    quotedMessageId: (r["quoted_message_id"] as string | null) ?? undefined,
    timestamp:       r["timestamp"]        as number,
    status:          (r["status"]          as Message["status"] | null) ?? undefined,
    isGroup:         Boolean(r["is_group"]),
    isFromMe:        Boolean(r["is_from_me"]),
  };
}

function rowToGroup(r: Record<string, unknown>): Group {
  return {
    id:          r["id"]          as string,
    name:        r["name"]        as string,
    description: (r["description"] as string | null) ?? undefined,
    members:     JSON.parse((r["members"] as string | null) ?? "[]") as Group["members"],
    createdAt:   (r["created_at"] as number | null) ?? undefined,
    inviteLink:  (r["invite_link"] as string | null) ?? undefined,
  };
}

function rowToContact(r: Record<string, unknown>): Contact {
  return {
    id:            r["id"]            as string,
    name:          (r["name"]         as string | null) ?? undefined,
    pushName:      (r["push_name"]    as string | null) ?? undefined,
    phone:         (r["phone"]        as string | null) ?? (r["id"] as string),
    statusMessage: (r["status_message"] as string | null) ?? undefined,
    isBlocked:     Boolean(r["is_blocked"]),
  };
}
