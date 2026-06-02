import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import type { WASocket, AnyMessageContent } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { mkdir } from "fs/promises";
import type {
  Message,
  Chat,
  Group,
  GroupMember,
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

export class BaileysClient extends WhatsAppAdapter {
  private sock: WASocket | null = null;
  private connected = false;
  private sessionPath: string;
  private readonly logger = pino({ level: "silent" });

  constructor() {
    super();
    this.sessionPath = process.env.WA_SESSION_PATH ?? "./data/session";
  }

  async connect(): Promise<void> {
    await mkdir(this.sessionPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger: this.logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.error("\n=== Scan this QR code with WhatsApp ===\n");
        qrcode.generate(qr, { small: true });
        console.error("\n=======================================\n");
      }
      if (connection === "close") {
        this.connected = false;
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(() => void this.connect(), 3000);
        } else {
          console.error("[WhatsApp] Logged out — delete session and reconnect");
        }
      } else if (connection === "open") {
        this.connected = true;
        console.error("[WhatsApp] Connected successfully");
      }
    });

    this.sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      const db = getDb();
      for (const rawMsg of messages) {
        const msg = rawMsg as unknown as Parameters<typeof baileysToMessage>[0];
        if (!msg.key?.remoteJid) continue;
        const message = baileysToMessage(msg);
        if (!message) continue;

        db.prepare(`
          INSERT OR REPLACE INTO messages
            (id, chat_id, from_id, from_name, type, text, media_id,
             quoted_message_id, timestamp, is_group, is_from_me, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          message.id, message.chatId, message.fromId,
          message.fromName ?? null, message.type,
          message.text ?? null, message.mediaId ?? null,
          message.quotedMessageId ?? null, message.timestamp,
          message.isGroup ? 1 : 0, message.isFromMe ? 1 : 0, "delivered",
        );

        this.onMessage?.(message);
      }
    });

    this.sock.ev.on("messages.update", (updates) => {
      const db = getDb();
      for (const update of updates) {
        if (update.update.status != null) {
          const status = protoStatusToString(update.update.status);
          db.prepare("UPDATE messages SET status = ? WHERE id = ?")
            .run(status, update.key.id ?? "");
          if (update.key.id) this.onMessageUpdate?.(update.key.id, status);
        }
      }
    });

    this.sock.ev.on("groups.update", (updates) => {
      const db = getDb();
      for (const update of updates) {
        db.prepare(`
          INSERT OR REPLACE INTO groups (id, name, description)
          VALUES (
            ?,
            COALESCE(?, (SELECT name FROM groups WHERE id = ?), 'Unknown'),
            COALESCE(?, (SELECT description FROM groups WHERE id = ?))
          )
        `).run(
          update.id,
          update.subject ?? null, update.id,
          update.desc ?? null, update.id,
        );
        if (update.id) {
          this.onGroupUpdate?.({ id: update.id, name: update.subject ?? undefined, description: update.desc ?? undefined });
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.sock?.logout();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(): WASocket {
    if (!this.sock) throw new Error("WhatsApp not connected — call connect() first");
    return this.sock;
  }

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(to);
    let content: AnyMessageContent;

    if (opts.emoji && opts.quotedMessageId) {
      content = {
        react: { key: { id: opts.quotedMessageId, remoteJid: jid }, text: opts.emoji },
      };
    } else if (opts.latitude != null && opts.longitude != null) {
      content = { location: { degreesLatitude: opts.latitude, degreesLongitude: opts.longitude } };
    } else if (opts.mediaType === "image" && opts.mediaUrl) {
      content = {
        image: { url: opts.mediaUrl },
        caption: opts.caption,
        mimetype: opts.mimeType ?? "image/jpeg",
      } as AnyMessageContent;
    } else if (opts.mediaType === "video" && opts.mediaUrl) {
      content = {
        video: { url: opts.mediaUrl },
        caption: opts.caption,
        mimetype: opts.mimeType ?? "video/mp4",
      } as AnyMessageContent;
    } else if (opts.mediaType === "audio" && opts.mediaUrl) {
      content = {
        audio: { url: opts.mediaUrl },
        mimetype: opts.mimeType ?? "audio/mpeg",
        ptt: false,
      } as AnyMessageContent;
    } else if (opts.mediaType === "document" && opts.mediaUrl) {
      content = {
        document: { url: opts.mediaUrl },
        caption: opts.caption,
        mimetype: opts.mimeType ?? "application/octet-stream",
        fileName: opts.fileName ?? "file",
      } as AnyMessageContent;
    } else {
      content = { text: opts.text ?? "" };
    }

    const sendOpts: Parameters<typeof sock.sendMessage>[2] = {};
    if (opts.quotedMessageId && !opts.emoji) {
      const quoted = await this.getMessage(opts.quotedMessageId);
      if (quoted) {
        sendOpts.quoted = {
          key: { remoteJid: jid, id: opts.quotedMessageId, fromMe: quoted.isFromMe },
          message: { conversation: quoted.text ?? "" },
        };
      }
    }

    const result = await sock.sendMessage(jid, content, sendOpts);
    return { id: result?.key.id ?? crypto.randomUUID(), timestamp: Date.now() };
  }

  async editMessage(messageId: string, chatId: string, newText: string): Promise<void> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(chatId);
    // Baileys edit: send a message with the `edit` key pointing to the original message ID
    await sock.sendMessage(jid, { text: newText, edit: messageId } as AnyMessageContent);
  }

  async deleteMessage(messageId: string, chatId: string, forEveryone = true): Promise<void> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(chatId);
    if (forEveryone) {
      await sock.sendMessage(jid, {
        delete: { id: messageId, remoteJid: jid, fromMe: true },
      } as AnyMessageContent);
    } else {
      await sock.chatModify(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { clear: { messages: [{ id: messageId, fromMe: true, timestamp: Math.floor(Date.now() / 1000) }] } } as any,
        jid,
      );
    }
  }

  async reactToMessage(messageId: string, chatId: string, emoji: string): Promise<void> {
    await this.sendMessage(chatId, { quotedMessageId: messageId, emoji });
  }

  async markAsRead(chatId: string, _messageId?: string): Promise<void> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(chatId);
    const db = getDb();
    const msgs = db.prepare(
      "SELECT id, is_from_me FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 10",
    ).all(jid) as { id: string; is_from_me: number }[];
    const keys = msgs.map((m) => ({ id: m.id, remoteJid: jid, fromMe: Boolean(m.is_from_me) }));
    if (keys.length > 0) await sock.readMessages(keys);
  }

  async getMessages(chatId: string, opts: PaginationOpts = {}): Promise<Message[]> {
    const db = getDb();
    const jid = normalizeJid(chatId);
    let query = "SELECT * FROM messages WHERE chat_id = ?";
    const params: (string | number)[] = [jid];
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
             MAX(timestamp) AS last_ts,
             SUM(CASE WHEN is_from_me = 0 THEN 1 ELSE 0 END) AS unread
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
    const sock = this.ensureConnected();
    const groups = await sock.groupFetchAllParticipating();
    const db = getDb();
    const result: Group[] = [];

    for (const [id, meta] of Object.entries(groups)) {
      const members: GroupMember[] = meta.participants.map((p) => ({
        id: p.id,
        isAdmin: p.admin === "admin" || p.admin === "superadmin",
        isSuperAdmin: p.admin === "superadmin",
      }));

      db.prepare(`
        INSERT OR REPLACE INTO groups (id, name, description, members, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, meta.subject, meta.desc ?? null, JSON.stringify(members), meta.creation ?? null);

      result.push({
        id,
        name: meta.subject,
        description: meta.desc ?? undefined,
        members,
        createdAt: meta.creation,
      });
    }
    return result;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(groupId);
    try {
      const meta = await sock.groupMetadata(jid);
      return {
        id: meta.id,
        name: meta.subject,
        description: meta.desc ?? undefined,
        members: meta.participants.map((p) => ({
          id: p.id,
          isAdmin: p.admin === "admin" || p.admin === "superadmin",
          isSuperAdmin: p.admin === "superadmin",
        })),
        createdAt: meta.creation,
      };
    } catch {
      return null;
    }
  }

  async createGroup(name: string, participants: string[]): Promise<Group> {
    const sock = this.ensureConnected();
    const result = await sock.groupCreate(name, participants.map(normalizeJid));
    return {
      id: result.id,
      name,
      members: participants.map((p) => ({ id: normalizeJid(p), isAdmin: false })),
    };
  }

  async updateGroup(groupId: string, updates: GroupUpdate): Promise<void> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(groupId);
    if (updates.name) await sock.groupUpdateSubject(jid, updates.name);
    if (updates.description) await sock.groupUpdateDescription(jid, updates.description);
    if (updates.picture) await sock.updateProfilePicture(jid, updates.picture);
  }

  async addGroupMember(groupId: string, phone: string): Promise<void> {
    const sock = this.ensureConnected();
    await sock.groupParticipantsUpdate(normalizeJid(groupId), [normalizeJid(phone)], "add");
  }

  async removeGroupMember(groupId: string, phone: string): Promise<void> {
    const sock = this.ensureConnected();
    await sock.groupParticipantsUpdate(normalizeJid(groupId), [normalizeJid(phone)], "remove");
  }

  async promoteGroupMember(groupId: string, phone: string): Promise<void> {
    const sock = this.ensureConnected();
    await sock.groupParticipantsUpdate(normalizeJid(groupId), [normalizeJid(phone)], "promote");
  }

  async demoteGroupMember(groupId: string, phone: string): Promise<void> {
    const sock = this.ensureConnected();
    await sock.groupParticipantsUpdate(normalizeJid(groupId), [normalizeJid(phone)], "demote");
  }

  async leaveGroup(groupId: string): Promise<void> {
    const sock = this.ensureConnected();
    await sock.groupLeave(normalizeJid(groupId));
  }

  async getGroupInviteLink(groupId: string): Promise<string> {
    const sock = this.ensureConnected();
    const code = await sock.groupInviteCode(normalizeJid(groupId));
    return `https://chat.whatsapp.com/${code}`;
  }

  async listContacts(): Promise<Contact[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM contacts").all() as Record<string, unknown>[]).map(rowToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const db = getDb();
    const jid = normalizeJid(contactId);
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(jid);
    return row ? rowToContact(row as Record<string, unknown>) : { id: jid, phone: jid };
  }

  async blockContact(contactId: string): Promise<void> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(contactId);
    await sock.updateBlockStatus(jid, "block");
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO contacts (id, phone, is_blocked) VALUES (?, ?, 1)")
      .run(jid, contactId);
  }

  async unblockContact(contactId: string): Promise<void> {
    const sock = this.ensureConnected();
    const jid = normalizeJid(contactId);
    await sock.updateBlockStatus(jid, "unblock");
    const db = getDb();
    db.prepare("UPDATE contacts SET is_blocked = 0 WHERE id = ?").run(jid);
  }

  async uploadMedia(buffer: Buffer, mimeType: string, _fileName?: string): Promise<MediaUploadResult> {
    const sock = this.ensureConnected();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upload = await (sock as any).waUploadToServer(buffer, mimeType);
    const mediaId = (upload as { fileEncSha256?: Buffer }).fileEncSha256?.toString("hex")
      ?? crypto.randomUUID();
    return { mediaId, mimeType };
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const db = getDb();
    const row = db.prepare("SELECT media_url FROM messages WHERE media_id = ?").get(mediaId) as
      | { media_url: string }
      | undefined;
    if (!row?.media_url) throw new Error("Media not found in store");
    const res = await fetch(row.media_url);
    return Buffer.from(await res.arrayBuffer());
  }

  async getBusinessProfile(): Promise<BusinessProfile> {
    const sock = this.ensureConnected();
    const user = sock.user;
    return {
      id: user?.id ?? "",
      name: user?.name ?? "",
      phone: user?.id?.split(":")[0] ?? "",
    };
  }

  async updateBusinessProfile(updates: Partial<BusinessProfile>): Promise<void> {
    const sock = this.ensureConnected();
    if (updates.name) await sock.updateProfileName(updates.name);
    if (updates.about) await sock.updateProfileStatus(updates.about);
  }
}

function normalizeJid(id: string): string {
  if (id.includes("@")) return id;
  const clean = id.replace(/\D/g, "");
  // Heuristic: group IDs tend to be longer or already contain @g.us
  return `${clean}@s.whatsapp.net`;
}

function protoStatusToString(status: number): string {
  const map: Record<number, string> = {
    0: "pending",
    1: "sent",
    2: "delivered",
    3: "read",
    4: "played",
  };
  return map[status] ?? "unknown";
}

function baileysToMessage(msg: Record<string, unknown> & { key: { remoteJid?: string | null; fromMe?: boolean | null; participant?: string | null; id?: string | null }; message?: Record<string, unknown> | null; pushName?: string | null; messageTimestamp?: number | null }): Message | null {
  const jid = msg.key.remoteJid;
  if (!jid) return null;

  const isGroup = jid.endsWith("@g.us");
  const isFromMe = msg.key.fromMe ?? false;
  const fromId = isFromMe
    ? jid
    : isGroup
      ? (msg.key.participant ?? jid)
      : jid;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = msg.message as any;
  if (!m) return null;

  let type: Message["type"] = "text";
  let text: string | undefined;
  const mediaId: string | undefined = undefined;
  let quotedMessageId: string | undefined;

  if (m.conversation ?? m.extendedTextMessage) {
    type = "text";
    text = (m.conversation ?? m.extendedTextMessage?.text) as string | undefined;
    quotedMessageId = m.extendedTextMessage?.contextInfo?.stanzaId as string | undefined;
  } else if (m.imageMessage) {
    type = "image";
    text = m.imageMessage.caption as string | undefined;
  } else if (m.videoMessage) {
    type = "video";
    text = m.videoMessage.caption as string | undefined;
  } else if (m.audioMessage) {
    type = "audio";
  } else if (m.documentMessage) {
    type = "document";
    text = m.documentMessage.caption as string | undefined;
  } else if (m.stickerMessage) {
    type = "sticker";
  } else if (m.locationMessage) {
    type = "location";
  } else if (m.reactionMessage) {
    type = "text";
    text = `[reaction: ${String(m.reactionMessage.text ?? "")}]`;
  } else {
    return null;
  }

  return {
    id: msg.key.id ?? crypto.randomUUID(),
    chatId: jid,
    fromId,
    fromName: msg.pushName ?? undefined,
    type,
    text,
    mediaId,
    quotedMessageId,
    timestamp: ((msg.messageTimestamp as number | null | undefined) ?? 0) * 1000,
    isGroup,
    isFromMe,
    status: "delivered",
  };
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
    members: JSON.parse((row["members"] as string | null) ?? "[]") as GroupMember[],
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

// Needed to avoid "not used" TS errors on helpers used only in other files
export type { GroupMember, Contact };
