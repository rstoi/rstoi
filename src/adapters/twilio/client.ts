/**
 * Twilio WhatsApp Adapter
 *
 * Integrates with Twilio's WhatsApp Sandbox (free, no Meta/Facebook account needed).
 * Production: add your WABA number after Twilio approval.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — from console.twilio.com → Account Info
 *   TWILIO_AUTH_TOKEN    — from console.twilio.com → Account Info
 *   TWILIO_WHATSAPP_FROM — sandbox: "whatsapp:+14155238886"
 *                          production: "whatsapp:+<your-number>"
 */
import axios, { type AxiosInstance } from "axios";
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

export class TwilioClient extends WhatsAppAdapter {
  private http: AxiosInstance;
  private accountSid: string;
  private from: string;
  private connected = false;

  constructor() {
    super();
    this.accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
    const authToken  = process.env.TWILIO_AUTH_TOKEN  ?? "";
    this.from        = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";

    this.http = axios.create({
      baseURL: `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`,
      auth: { username: this.accountSid, password: authToken },
    });
  }

  async connect(): Promise<void> {
    if (!this.accountSid) throw new Error("TWILIO_ACCOUNT_SID not set");
    // Quick validation — fetch account info
    await this.http.get(".json");
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }
  isConnected(): boolean { return this.connected; }

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    const toWa = normalizeToWa(to);
    const params = new URLSearchParams();
    params.append("From", this.from);
    params.append("To",   toWa);

    if (opts.templateName) {
      // Twilio content templates (optional); fallback to text with name
      params.append("Body", `[template: ${opts.templateName}]`);
    } else if (opts.mediaUrl) {
      params.append("Body",    opts.caption ?? "");
      params.append("MediaUrl", opts.mediaUrl);
    } else {
      params.append("Body", opts.text ?? "");
    }

    const res = await this.http.post("/Messages.json", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const msgId = res.data.sid as string;
    const ts    = Date.now();
    const phone = toWa.replace("whatsapp:", "").replace("+", "");
    const jid   = `${phone}@s.whatsapp.net`;

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me, status)
      VALUES (?, ?, ?, 'Você', ?, ?, ?, 0, 1, 'sent')
    `).run(msgId, jid, this.from, opts.templateName ? "template" : opts.mediaUrl ? "media" : "text",
           opts.text ?? opts.caption ?? `[template: ${opts.templateName ?? ""}]`, ts);

    db.prepare("INSERT OR IGNORE INTO contacts (id, name, phone) VALUES (?, ?, ?)").run(jid, phone, phone);

    return { id: msgId, timestamp: ts };
  }

  async editMessage(_messageId: string, _chatId: string, _newText: string): Promise<void> {
    throw new Error("Message editing not supported by Twilio WhatsApp API");
  }

  async deleteMessage(messageId: string, _chatId: string): Promise<void> {
    await this.http.delete(`/Messages/${messageId}.json`);
    getDb().prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  }

  async reactToMessage(_messageId: string, _chatId: string, _emoji: string): Promise<void> {
    throw new Error("Reactions not supported by Twilio WhatsApp API");
  }

  async markAsRead(_chatId: string, _messageId?: string): Promise<void> {
    // Twilio does not expose a mark-as-read endpoint
  }

  async getMessages(chatId: string, opts: PaginationOpts = {}): Promise<Message[]> {
    const db = getDb();
    let query = "SELECT * FROM messages WHERE chat_id = ?";
    const params: (string | number)[] = [chatId];
    if (opts.after)  { query += " AND timestamp > ?"; params.push(opts.after); }
    if (opts.before) { query += " AND timestamp < ?"; params.push(opts.before); }
    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(opts.limit ?? 50);
    return (db.prepare(query).all(...params) as Record<string, unknown>[]).map(rowToMessage);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const db  = getDb();
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
    return row ? rowToMessage(row as Record<string, unknown>) : null;
  }

  async listChats(): Promise<Chat[]> {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT chat_id, MAX(timestamp) AS last_ts,
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

  async listGroups():               Promise<Group[]>   { return []; }
  async getGroup(_id: string):      Promise<Group | null> { return null; }
  async createGroup(_n: string, _p: string[]): Promise<Group> { throw new Error("Not supported"); }
  async updateGroup(_id: string, _u: GroupUpdate): Promise<void> { throw new Error("Not supported"); }
  async addGroupMember(_g: string, _p: string): Promise<void> { throw new Error("Not supported"); }
  async removeGroupMember(_g: string, _p: string): Promise<void> { throw new Error("Not supported"); }
  async promoteGroupMember(_g: string, _p: string): Promise<void> { throw new Error("Not supported"); }
  async demoteGroupMember(_g: string, _p: string): Promise<void> { throw new Error("Not supported"); }
  async leaveGroup(_id: string): Promise<void> { throw new Error("Not supported"); }
  async getGroupInviteLink(_id: string): Promise<string> { throw new Error("Not supported"); }

  async listContacts(): Promise<Contact[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM contacts").all() as Record<string, unknown>[]).map(rowToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const db  = getDb();
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
    return row ? rowToContact(row as Record<string, unknown>) : null;
  }

  async blockContact(_id: string): Promise<void>   { throw new Error("Not supported"); }
  async unblockContact(_id: string): Promise<void> { throw new Error("Not supported"); }

  async uploadMedia(buffer: Buffer, mimeType: string, _fileName?: string): Promise<MediaUploadResult> {
    // Twilio accepts public media URLs; local upload not directly supported
    // Store buffer temporarily and return a placeholder
    return { mediaId: `local-${Date.now()}`, mimeType };
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const res = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      auth: { username: this.accountSid, password: process.env.TWILIO_AUTH_TOKEN ?? "" },
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  async getBusinessProfile(): Promise<BusinessProfile> {
    const res = await this.http.get(".json");
    return {
      id:    this.accountSid,
      name:  res.data.friendly_name as string ?? "Twilio WhatsApp",
      phone: this.from.replace("whatsapp:", ""),
    };
  }

  async updateBusinessProfile(_updates: Partial<BusinessProfile>): Promise<void> {
    // Not applicable for Twilio sandbox
  }

  // Webhook support
  verifyWebhook(token: string, challenge: string): string {
    if (token !== (process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "")) throw new Error("Invalid token");
    return challenge;
  }

  async processWebhookPayload(payload: unknown): Promise<void> {
    const data = payload as Record<string, string>;
    // Twilio sends form-encoded data; express.urlencoded() parses it
    if (!data["MessageSid"]) return;

    const msgId  = data["MessageSid"];
    const from   = (data["From"] ?? "").replace("whatsapp:", "").replace("+", "");
    const fromJid = `${from}@s.whatsapp.net`;
    const body   = data["Body"] ?? "";
    const ts     = Date.now();

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me, status)
      VALUES (?, ?, ?, ?, 'text', ?, ?, 0, 0, 'delivered')
    `).run(msgId, fromJid, fromJid, from, body, ts);

    db.prepare("INSERT OR IGNORE INTO contacts (id, name, phone) VALUES (?, ?, ?)").run(fromJid, from, from);

    this.onMessage?.({
      id: msgId, chatId: fromJid, fromId: fromJid, fromName: from,
      type: "text", text: body, timestamp: ts, isGroup: false, isFromMe: false,
    });
  }
}

function normalizeToWa(to: string): string {
  if (to.startsWith("whatsapp:")) return to;
  const digits = to.replace(/\D/g, "");
  return `whatsapp:+${digits}`;
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id:              row["id"] as string,
    chatId:          row["chat_id"] as string,
    fromId:          row["from_id"] as string,
    fromName:        (row["from_name"] as string | null) ?? undefined,
    type:            row["type"] as Message["type"],
    text:            (row["text"] as string | null) ?? undefined,
    timestamp:       row["timestamp"] as number,
    status:          (row["status"] as Message["status"] | null) ?? undefined,
    isGroup:         Boolean(row["is_group"]),
    isFromMe:        Boolean(row["is_from_me"]),
  };
}

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id:        row["id"] as string,
    name:      (row["name"] as string | null) ?? undefined,
    phone:     (row["phone"] as string | null) ?? (row["id"] as string),
    isBlocked: Boolean(row["is_blocked"]),
  };
}
