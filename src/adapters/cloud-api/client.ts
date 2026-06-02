import axios, { type AxiosInstance } from "axios";
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
  private http: AxiosInstance;
  private phoneNumberId: string;
  private businessAccountId: string;
  private connected = false;

  constructor() {
    super();
    this.phoneNumberId = process.env.WA_PHONE_NUMBER_ID ?? "";
    this.businessAccountId = process.env.WA_BUSINESS_ACCOUNT_ID ?? "";
    const accessToken = process.env.WA_ACCESS_TOKEN ?? "";
    const baseURL = process.env.WA_API_BASE_URL ?? "https://graph.facebook.com/v21.0";
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

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
      if (opts.mediaType === "image") body.image = media;
      else if (opts.mediaType === "video") body.video = media;
      else if (opts.mediaType === "audio") body.audio = { id: opts.mediaId, link: opts.mediaUrl };
      else if (opts.mediaType === "document") body.document = { ...media, filename: opts.fileName };
    } else if (opts.latitude != null && opts.longitude != null) {
      body.type = "location";
      body.location = { latitude: opts.latitude, longitude: opts.longitude };
    } else {
      body.type = "text";
      body.text = { body: opts.text ?? "" };
    }

    const res = await this.http.post(`/${this.phoneNumberId}/messages`, body);
    return { id: res.data.messages[0].id, timestamp: Date.now() };
  }

  async editMessage(messageId: string, chatId: string, newText: string): Promise<void> {
    await this.http.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      to: chatId,
      type: "text",
      text: { body: newText },
      context: { message_id: messageId },
    });
  }

  async deleteMessage(messageId: string, _chatId: string, _forEveryone = true): Promise<void> {
    await this.http.delete(`/${this.phoneNumberId}/messages/${messageId}`);
  }

  async reactToMessage(messageId: string, chatId: string, emoji: string): Promise<void> {
    await this.sendMessage(chatId, { quotedMessageId: messageId, emoji });
  }

  async markAsRead(_chatId: string, messageId?: string): Promise<void> {
    if (!messageId) return;
    await this.http.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  async getMessages(chatId: string, opts: PaginationOpts = {}): Promise<Message[]> {
    const db = getDb();
    let query = "SELECT * FROM messages WHERE chat_id = ?";
    const params: (string | number)[] = [chatId];
    if (opts.after) { query += " AND timestamp > ?"; params.push(opts.after); }
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
             MAX(timestamp)                                                 AS last_ts,
             SUM(CASE WHEN is_from_me = 0 AND status != 'read' THEN 1 ELSE 0 END) AS unread
      FROM messages
      GROUP BY chat_id
      ORDER BY last_ts DESC
    `).all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r["chat_id"] as string,
      name: r["chat_id"] as string,
      isGroup: (r["chat_id"] as string).endsWith("@g.us"),
      lastMessageAt: r["last_ts"] as number,
      unreadCount: r["unread"] as number,
    }));
  }

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

  async uploadMedia(buffer: Buffer, mimeType: string, fileName?: string): Promise<MediaUploadResult> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName ?? "file");
    const res = await this.http.post(`/${this.phoneNumberId}/media`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { mediaId: res.data.id, mimeType };
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const metaRes = await this.http.get(`/${mediaId}`);
    const dlRes = await this.http.get(metaRes.data.url as string, { responseType: "arraybuffer" });
    return Buffer.from(dlRes.data as ArrayBuffer);
  }

  async getBusinessProfile(): Promise<BusinessProfile> {
    const res = await this.http.get(`/${this.phoneNumberId}/whatsapp_business_profile`, {
      params: { fields: "about,address,description,email,profile_picture_url,websites,vertical" },
    });
    return {
      id: this.phoneNumberId,
      name: (res.data.name as string | undefined) ?? "",
      phone: (res.data.display_phone_number as string | undefined) ?? "",
      about: res.data.about as string | undefined,
      email: res.data.email as string | undefined,
      address: res.data.address as string | undefined,
    };
  }

  async updateBusinessProfile(updates: Partial<BusinessProfile>): Promise<void> {
    await this.http.post(`/${this.phoneNumberId}/whatsapp_business_profile`, {
      messaging_product: "whatsapp",
      ...updates,
    });
  }

  async listTemplates(): Promise<MessageTemplate[]> {
    const res = await this.http.get(`/${this.businessAccountId}/message_templates`);
    return (res.data.data as Record<string, unknown>[]).map((t) => ({
      id: t["id"] as string,
      name: t["name"] as string,
      language: t["language"] as string,
      status: (t["status"] as string).toLowerCase() as MessageTemplate["status"],
      category: t["category"] as string,
      components: t["components"] as unknown[],
    }));
  }

  verifyWebhook(token: string, challenge: string): string {
    if (token !== (process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "")) {
      throw new Error("Invalid verify token");
    }
    return challenge;
  }

  async processWebhookPayload(payload: unknown): Promise<void> {
    const data = payload as CloudApiWebhookPayload;
    const db = getDb();

    for (const entry of data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const contactMap: Record<string, string> = {};
        for (const c of value.contacts ?? []) {
          contactMap[c.wa_id] = c.profile.name;
        }

        for (const msg of value.messages ?? []) {
          const message: Message = {
            id: msg.id,
            chatId: msg.from,
            fromId: msg.from,
            fromName: contactMap[msg.from],
            type: msg.type as Message["type"],
            text: msg.text?.body,
            timestamp: parseInt(msg.timestamp, 10) * 1000,
            isGroup: false,
            isFromMe: false,
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

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row["id"] as string,
    chatId: row["chat_id"] as string,
    fromId: row["from_id"] as string,
    fromName: (row["from_name"] as string | null) ?? undefined,
    type: row["type"] as Message["type"],
    text: (row["text"] as string | null) ?? undefined,
    mediaId: (row["media_id"] as string | null) ?? undefined,
    mediaUrl: (row["media_url"] as string | null) ?? undefined,
    mimeType: (row["mime_type"] as string | null) ?? undefined,
    fileName: (row["file_name"] as string | null) ?? undefined,
    quotedMessageId: (row["quoted_message_id"] as string | null) ?? undefined,
    timestamp: row["timestamp"] as number,
    status: (row["status"] as Message["status"] | null) ?? undefined,
    isGroup: Boolean(row["is_group"]),
    isFromMe: Boolean(row["is_from_me"]),
  };
}

function rowToGroup(row: Record<string, unknown>): Group {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string | null) ?? undefined,
    members: JSON.parse((row["members"] as string | null) ?? "[]") as Group["members"],
    createdAt: (row["created_at"] as number | null) ?? undefined,
    inviteLink: (row["invite_link"] as string | null) ?? undefined,
  };
}

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row["id"] as string,
    name: (row["name"] as string | null) ?? undefined,
    pushName: (row["push_name"] as string | null) ?? undefined,
    phone: (row["phone"] as string | null) ?? (row["id"] as string),
    statusMessage: (row["status_message"] as string | null) ?? undefined,
    isBlocked: Boolean(row["is_blocked"]),
  };
}
