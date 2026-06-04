import type { CloudApiMessage, CloudApiWebhookPayload } from "./types.js";
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
  MessageTemplate,
  MediaUploadResult,
} from "../../types/index.js";
import { WhatsAppAdapter } from "../base.js";
import { getDb } from "../../store/db.js";

export class CloudApiClient extends WhatsAppAdapter {
  private baseUrl: string;
  private accessToken: string;
  private phoneNumberId: string;
  private businessAccountId: string;
  private connected = false;

  constructor() {
    super();
    this.phoneNumberId     = process.env.WA_PHONE_NUMBER_ID     ?? "";
    this.businessAccountId = process.env.WA_BUSINESS_ACCOUNT_ID ?? "";
    this.accessToken       = process.env.WA_ACCESS_TOKEN        ?? "";
    this.baseUrl           = (process.env.WA_API_BASE_URL ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");
  }

  // ── HTTP helpers (native fetch — zero external deps) ──────────────────────

  private async req<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };
    let bodyStr: string | undefined;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(body);
    }
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body instanceof FormData ? body : bodyStr,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Meta API ${res.status} ${res.statusText}: ${txt}`);
    }
    return res.json() as Promise<T>;
  }

  private get<T = unknown>(path: string, params?: Record<string, string>) {
    return this.req<T>("GET", path, undefined, params);
  }
  private post<T = unknown>(path: string, body: unknown) {
    return this.req<T>("POST", path, body);
  }
  private delete<T = unknown>(path: string) {
    return this.req<T>("DELETE", path);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void>    { this.connected = true; }
  async disconnect(): Promise<void> { this.connected = false; }
  isConnected(): boolean            { return this.connected; }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    const body: CloudApiMessage = { messaging_product: "whatsapp", to, type: "text" };

    if (opts.quotedMessageId) body.context = { message_id: opts.quotedMessageId };

    if (opts.emoji && opts.quotedMessageId) {
      body.type = "reaction";
      body.reaction = { message_id: opts.quotedMessageId, emoji: opts.emoji };
    } else if (opts.templateName) {
      body.type = "template";
      body.template = {
        name: opts.templateName,
        language: { code: opts.templateLanguage ?? "pt_BR" },
        components: opts.templateComponents,
      };
    } else if (opts.mediaType && (opts.mediaId ?? opts.mediaUrl)) {
      body.type = opts.mediaType;
      const media = { id: opts.mediaId, link: opts.mediaUrl, caption: opts.caption };
      if      (opts.mediaType === "image")    body.image    = media;
      else if (opts.mediaType === "video")    body.video    = media;
      else if (opts.mediaType === "audio")    body.audio    = { id: opts.mediaId, link: opts.mediaUrl };
      else if (opts.mediaType === "document") body.document = { ...media, filename: opts.fileName };
    } else if (opts.latitude != null && opts.longitude != null) {
      body.type     = "location";
      body.location = { latitude: opts.latitude, longitude: opts.longitude };
    } else {
      body.type = "text";
      body.text = { body: opts.text ?? "" };
    }

    const res = await this.post<{ messages: Array<{ id: string }> }>(
      `/${this.phoneNumberId}/messages`, body,
    );
    return { id: res.messages[0].id, timestamp: Date.now() };
  }

  async editMessage(messageId: string, chatId: string, newText: string): Promise<void> {
    await this.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: chatId,
      type: "text",
      text: { body: newText },
      context: { message_id: messageId },
    });
  }

  async deleteMessage(messageId: string, _chatId: string, _forEveryone = true): Promise<void> {
    await this.delete(`/${this.phoneNumberId}/messages/${messageId}`);
  }

  async reactToMessage(messageId: string, chatId: string, emoji: string): Promise<void> {
    await this.sendMessage(chatId, { quotedMessageId: messageId, emoji });
  }

  async markAsRead(_chatId: string, messageId?: string): Promise<void> {
    if (!messageId) return;
    await this.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  // ── Reading ───────────────────────────────────────────────────────────────

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
    const db = getDb();
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
      unreadCount:   r["unread"] as number,
    }));
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  async listGroups(): Promise<Group[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM groups").all() as Record<string, unknown>[]).map(rowToGroup);
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId);
    return row ? rowToGroup(row as Record<string, unknown>) : null;
  }

  async createGroup(_name: string, _participants: string[]): Promise<Group> {
    throw new Error("Cloud API does not support creating groups directly");
  }
  async updateGroup(_groupId: string, _updates: GroupUpdate): Promise<void> {
    throw new Error("Group updates not supported via Cloud API");
  }
  async addGroupMember(_groupId: string, _phone: string): Promise<void> {
    throw new Error("Group management not supported via Cloud API");
  }
  async removeGroupMember(_groupId: string, _phone: string): Promise<void> {
    throw new Error("Group management not supported via Cloud API");
  }
  async promoteGroupMember(_groupId: string, _phone: string): Promise<void> {
    throw new Error("Group management not supported via Cloud API");
  }
  async demoteGroupMember(_groupId: string, _phone: string): Promise<void> {
    throw new Error("Group management not supported via Cloud API");
  }
  async leaveGroup(_groupId: string): Promise<void> {
    throw new Error("Group leave not supported via Cloud API");
  }
  async getGroupInviteLink(_groupId: string): Promise<string> {
    throw new Error("Group invite links not supported via Cloud API");
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(): Promise<Contact[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM contacts").all() as Record<string, unknown>[]).map(rowToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
    return row ? rowToContact(row as Record<string, unknown>) : null;
  }

  async blockContact(_contactId: string): Promise<void> {
    throw new Error("Block contact not supported via Cloud API");
  }
  async unblockContact(_contactId: string): Promise<void> {
    throw new Error("Unblock contact not supported via Cloud API");
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  async uploadMedia(buffer: Buffer, mimeType: string, fileName?: string): Promise<MediaUploadResult> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName ?? "file");
    const res = await this.req<{ id: string }>("POST", `/${this.phoneNumberId}/media`, form);
    return { mediaId: res.id, mimeType };
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const meta = await this.get<{ url: string }>(`/${mediaId}`);
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return Buffer.from(await res.arrayBuffer());
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getBusinessProfile(): Promise<BusinessProfile> {
    const [profileData, phoneData] = await Promise.all([
      this.get<{ data?: Record<string, unknown>[] }>(
        `/${this.phoneNumberId}/whatsapp_business_profile`,
        { fields: "about,address,description,email,profile_picture_url,websites,vertical" },
      ),
      this.get<Record<string, unknown>>(`/${this.phoneNumberId}`),
    ]);
    const profile = profileData.data?.[0] ?? {};
    return {
      id:      this.phoneNumberId,
      name:    (phoneData["verified_name"]     as string | undefined) ?? "",
      phone:   (phoneData["display_phone_number"] as string | undefined) ?? "",
      about:   profile["about"]   as string | undefined,
      email:   profile["email"]   as string | undefined,
      address: profile["address"] as string | undefined,
    };
  }

  async updateBusinessProfile(updates: Partial<BusinessProfile>): Promise<void> {
    await this.post(`/${this.phoneNumberId}/whatsapp_business_profile`, {
      messaging_product: "whatsapp",
      ...updates,
    });
  }

  async listTemplates(): Promise<MessageTemplate[]> {
    const res = await this.get<{ data: Record<string, unknown>[] }>(
      `/${this.businessAccountId}/message_templates`,
    );
    return res.data.map(t => ({
      id:         t["id"]       as string,
      name:       t["name"]     as string,
      language:   t["language"] as string,
      status:     (t["status"] as string).toLowerCase() as MessageTemplate["status"],
      category:   t["category"] as string,
      components: t["components"] as unknown[],
    }));
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  verifyWebhook(token: string, challenge: string): string {
    if (token !== (process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "")) {
      throw new Error("Invalid verify token");
    }
    return challenge;
  }

  async processWebhookPayload(payload: unknown): Promise<void> {
    const data = payload as CloudApiWebhookPayload;
    const db   = getDb();

    for (const entry of data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const contactMap: Record<string, string> = {};
        for (const c of value.contacts ?? []) {
          contactMap[c.wa_id] = c.profile.name;
        }

        for (const msg of value.messages ?? []) {
          const message: Message = {
            id:        msg.id,
            chatId:    msg.from,
            fromId:    msg.from,
            fromName:  contactMap[msg.from],
            type:      msg.type as Message["type"],
            text:      msg.text?.body,
            timestamp: parseInt(msg.timestamp, 10) * 1000,
            isGroup:   false,
            isFromMe:  false,
          };
          db.prepare(`
            INSERT OR REPLACE INTO messages
              (id, chat_id, from_id, from_name, type, text, timestamp, is_group, is_from_me)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            message.id, message.chatId, message.fromId,
            message.fromName ?? null, message.type,
            message.text ?? null, message.timestamp, 0, 0,
          );
          this.onMessage?.(message);
        }

        for (const status of value.statuses ?? []) {
          db.prepare("UPDATE messages SET status = ? WHERE id = ?").run(status.status, status.id);
          this.onMessageUpdate?.(status.id, status.status);
        }
      }
    }
  }
}

// ── DB row mappers ────────────────────────────────────────────────────────────

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id:               r["id"]               as string,
    chatId:           r["chat_id"]          as string,
    fromId:           r["from_id"]          as string,
    fromName:         (r["from_name"]       as string | null) ?? undefined,
    type:             r["type"]             as Message["type"],
    text:             (r["text"]            as string | null) ?? undefined,
    mediaId:          (r["media_id"]        as string | null) ?? undefined,
    mediaUrl:         (r["media_url"]       as string | null) ?? undefined,
    mimeType:         (r["mime_type"]       as string | null) ?? undefined,
    fileName:         (r["file_name"]       as string | null) ?? undefined,
    quotedMessageId:  (r["quoted_message_id"] as string | null) ?? undefined,
    timestamp:        r["timestamp"]        as number,
    status:           (r["status"]          as Message["status"] | null) ?? undefined,
    isGroup:          Boolean(r["is_group"]),
    isFromMe:         Boolean(r["is_from_me"]),
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
