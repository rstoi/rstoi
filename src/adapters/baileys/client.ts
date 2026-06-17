/**
 * WhatsApp Adapter — Baileys
 *
 * Connects to WhatsApp Web using the Baileys WebSocket protocol library.
 * Unlike the Playwright adapter, no browser is needed — Baileys speaks
 * the WhatsApp Web protocol directly.
 *
 * First run: prints QR to stdout (and saves to WA_QR_PATH if set).
 * Subsequent runs: restores session from WA_SESSION_DIR automatically.
 *
 * Env vars:
 *   WA_SESSION_DIR   — where to persist auth credentials (default: ./data/wa-session)
 *   WA_QR_PATH       — path to save QR PNG (optional)
 *   LOG_LEVEL        — "silent" suppresses Baileys internal logs
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type proto,
  type BaileysEventMap,
  Browsers,
} from "@whiskeysockets/baileys";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import QRCode from "qrcode";
import type {
  Message, Chat, Group, Contact,
  SendMessageOptions, SentMessage,
  PaginationOpts, GroupUpdate,
  BusinessProfile, MediaUploadResult,
  GroupMember,
} from "../../types/index.js";
import { WhatsAppAdapter } from "../base.js";
import { getDb } from "../../store/db.js";

const RECONNECT_DELAY_MS = [2_000, 4_000, 8_000, 16_000, 30_000];

export class BaileysClient extends WhatsAppAdapter {
  private sock: WASocket | null = null;
  private connected = false;
  private sessionDir: string;
  private qrPath: string | undefined;
  private reconnectAttempt = 0;
  private stopping = false;

  constructor() {
    super();
    this.sessionDir = resolve(process.env.WA_SESSION_DIR ?? "./data/wa-session");
    this.qrPath = process.env.WA_QR_PATH ? resolve(process.env.WA_QR_PATH) : undefined;
    mkdirSync(this.sessionDir, { recursive: true });
    mkdirSync(resolve("./data"), { recursive: true });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._connect(resolve, reject);
    });
  }

  private async _connect(onReady: () => void, onFail: (e: Error) => void): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.error(`[baileys] Connecting (version ${version.join(".")})`);

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console as never),
      },
      browser: Browsers.ubuntu("Claude Agent"),
      printQRInTerminal: true,
      logger: { level: "silent" } as never,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    const sock = this.sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.error("[baileys] QR code ready — scan with WhatsApp > Linked Devices");
        if (this.qrPath) {
          try {
            await QRCode.toFile(this.qrPath, qr);
            console.error(`[baileys] QR saved to ${this.qrPath}`);
          } catch { /* ignore */ }
        }
      }

      if (connection === "open") {
        console.error("[baileys] Connected!");
        this.connected = true;
        this.reconnectAttempt = 0;
        onReady();
      }

      if (connection === "close") {
        this.connected = false;
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.error("[baileys] Logged out — session invalidated. Scan a new QR to reconnect.");
          onFail(new Error("WhatsApp session logged out"));
          return;
        }

        if (this.stopping) return;

        const delay = RECONNECT_DELAY_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAY_MS.length - 1)];
        this.reconnectAttempt++;
        console.error(`[baileys] Connection closed (reason ${reason}). Reconnecting in ${delay}ms… (attempt ${this.reconnectAttempt})`);
        setTimeout(() => this._connect(onReady, onFail), delay);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        const mapped = this._mapMessage(msg);
        if (mapped) {
          this._storeMessage(mapped);
          this.onMessage?.(mapped);
        }
      }
    });

    sock.ev.on("messages.update", (updates) => {
      for (const update of updates) {
        if (update.update.status != null) {
          this.onMessageUpdate?.(update.key.id!, String(update.update.status));
        }
      }
    });

    sock.ev.on("groups.upsert", (groups) => {
      for (const g of groups) {
        this.onGroupUpdate?.({ id: g.id, name: g.subject });
      }
    });

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) {
        this.onContactUpdate?.({ id: c.id, name: c.name, pushName: c.notify });
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopping = true;
    await this.sock?.end(undefined);
    this.sock = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private get socket(): WASocket {
    if (!this.sock || !this.connected) throw new Error("WhatsApp not connected");
    return this.sock;
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    const jid = this._toJid(to);
    let content: proto.IMessage = {};

    if (opts.quotedMessageId) {
      const quoted = await this.getMessage(opts.quotedMessageId);
      if (quoted) {
        // Build a minimal quoted message for context
        content = {
          extendedTextMessage: {
            text: opts.text ?? "",
            contextInfo: { stanzaId: opts.quotedMessageId, participant: quoted.fromId, quotedMessage: { conversation: quoted.text } },
          },
        };
      } else {
        content = { conversation: opts.text ?? "" };
      }
    } else if (opts.text) {
      content = { conversation: opts.text };
    } else if (opts.mediaUrl || opts.mediaId) {
      const url = opts.mediaUrl ?? opts.mediaId!;
      const mt = opts.mediaType ?? "document";
      if (mt === "image") content = { imageMessage: { url, caption: opts.caption, mimetype: opts.mimeType ?? "image/jpeg" } };
      else if (mt === "video") content = { videoMessage: { url, caption: opts.caption, mimetype: opts.mimeType ?? "video/mp4" } };
      else if (mt === "audio") content = { audioMessage: { url, mimetype: opts.mimeType ?? "audio/ogg; codecs=opus", ptt: false } };
      else content = { documentMessage: { url, mimetype: opts.mimeType ?? "application/octet-stream", fileName: opts.fileName } };
    } else if (opts.latitude != null && opts.longitude != null) {
      content = { locationMessage: { degreesLatitude: opts.latitude, degreesLongitude: opts.longitude } };
    }

    const result = await this.socket.sendMessage(jid, content as never);
    return { id: result!.key.id!, timestamp: Date.now() };
  }

  async editMessage(messageId: string, chatId: string, newText: string): Promise<void> {
    await this.socket.sendMessage(this._toJid(chatId), {
      edit: { remoteJid: this._toJid(chatId), id: messageId },
      text: newText,
    } as never);
  }

  async deleteMessage(messageId: string, chatId: string, forEveryone = true): Promise<void> {
    const jid = this._toJid(chatId);
    await this.socket.sendMessage(jid, {
      delete: { remoteJid: jid, id: messageId, fromMe: true },
    } as never);
    if (!forEveryone) return;
  }

  async reactToMessage(messageId: string, chatId: string, emoji: string): Promise<void> {
    const jid = this._toJid(chatId);
    await this.socket.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
  }

  async markAsRead(chatId: string, messageId?: string): Promise<void> {
    const jid = this._toJid(chatId);
    await this.socket.readMessages([{ remoteJid: jid, id: messageId ?? "", fromMe: false }]);
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  async getMessages(chatId: string, opts: PaginationOpts = {}): Promise<Message[]> {
    const db = getDb();
    let q = "SELECT * FROM messages WHERE chat_id = ?";
    const params: (string | number)[] = [chatId];
    if (opts.after) { q += " AND timestamp > ?"; params.push(opts.after); }
    if (opts.before) { q += " AND timestamp < ?"; params.push(opts.before); }
    q += " ORDER BY timestamp DESC LIMIT ?";
    params.push(opts.limit ?? 50);
    return (db.prepare(q).all(...params) as Record<string, unknown>[]).map(this._rowToMessage);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as Record<string, unknown> | undefined;
    return row ? this._rowToMessage(row) : null;
  }

  // ── Chats ────────────────────────────────────────────────────────────────

  async listChats(): Promise<Chat[]> {
    const chats = await this.socket.groupFetchAllParticipating();
    const groups: Chat[] = Object.values(chats).map((g) => ({
      id: g.id,
      name: g.subject,
      isGroup: true,
      participantCount: g.participants.length,
    }));

    const db = getDb();
    const dmRows = db.prepare(
      "SELECT DISTINCT chat_id FROM messages WHERE chat_id NOT LIKE '%@g.us' ORDER BY timestamp DESC LIMIT 100"
    ).all() as { chat_id: string }[];
    const dms: Chat[] = dmRows.map((r) => ({
      id: r.chat_id,
      name: r.chat_id.replace("@s.whatsapp.net", ""),
      isGroup: false,
    }));

    return [...groups, ...dms];
  }

  // ── Groups ───────────────────────────────────────────────────────────────

  async listGroups(): Promise<Group[]> {
    const map = await this.socket.groupFetchAllParticipating();
    return Object.values(map).map(this._mapGroup);
  }

  async getGroup(groupId: string): Promise<Group | null> {
    try {
      const meta = await this.socket.groupMetadata(this._toJid(groupId));
      return this._mapGroup(meta);
    } catch {
      return null;
    }
  }

  async createGroup(name: string, participants: string[]): Promise<Group> {
    const result = await this.socket.groupCreate(name, participants.map(this._toJid));
    const meta = await this.socket.groupMetadata(result.id);
    return this._mapGroup(meta);
  }

  async updateGroup(groupId: string, updates: GroupUpdate): Promise<void> {
    const jid = this._toJid(groupId);
    if (updates.name) await this.socket.groupUpdateSubject(jid, updates.name);
    if (updates.description) await this.socket.groupUpdateDescription(jid, updates.description);
    if (updates.picture) await this.socket.updateProfilePicture(jid, updates.picture);
  }

  async addGroupMember(groupId: string, phone: string): Promise<void> {
    await this.socket.groupParticipantsUpdate(this._toJid(groupId), [this._toJid(phone)], "add");
  }

  async removeGroupMember(groupId: string, phone: string): Promise<void> {
    await this.socket.groupParticipantsUpdate(this._toJid(groupId), [this._toJid(phone)], "remove");
  }

  async promoteGroupMember(groupId: string, phone: string): Promise<void> {
    await this.socket.groupParticipantsUpdate(this._toJid(groupId), [this._toJid(phone)], "promote");
  }

  async demoteGroupMember(groupId: string, phone: string): Promise<void> {
    await this.socket.groupParticipantsUpdate(this._toJid(groupId), [this._toJid(phone)], "demote");
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.socket.groupLeave(this._toJid(groupId));
  }

  async getGroupInviteLink(groupId: string): Promise<string> {
    const code = await this.socket.groupInviteCode(this._toJid(groupId));
    return `https://chat.whatsapp.com/${code}`;
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(): Promise<Contact[]> {
    const db = getDb();
    return (db.prepare("SELECT * FROM contacts LIMIT 500").all() as Record<string, unknown>[]).map(this._rowToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId) as Record<string, unknown> | undefined;
    if (row) return this._rowToContact(row);
    try {
      const results = await this.socket.fetchStatus(this._toJid(contactId));
      const status = Array.isArray(results) ? results[0] : undefined;
      return { id: contactId, phone: contactId.replace("@s.whatsapp.net", ""), statusMessage: (status as { status?: string } | undefined)?.status };
    } catch {
      return null;
    }
  }

  async blockContact(contactId: string): Promise<void> {
    await this.socket.updateBlockStatus(this._toJid(contactId), "block");
  }

  async unblockContact(contactId: string): Promise<void> {
    await this.socket.updateBlockStatus(this._toJid(contactId), "unblock");
  }

  // ── Media ────────────────────────────────────────────────────────────────

  async uploadMedia(buffer: Buffer, mimeType: string, fileName?: string): Promise<MediaUploadResult> {
    const uploaded = await this.socket.waUploadToServer(buffer as never, {} as never);
    return {
      mediaId: (uploaded as Record<string, unknown>).fileEncSha256 as string ?? "",
      mimeType,
      fileSize: buffer.length,
    };
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    throw new Error(`downloadMedia by ID not supported in Baileys adapter. Use message object to download. (id: ${mediaId})`);
  }

  // ── Profile ──────────────────────────────────────────────────────────────

  async getBusinessProfile(): Promise<BusinessProfile> {
    const jid = this.sock?.user?.id ?? "me";
    const name = this.sock?.user?.name ?? "WhatsApp";
    const phone = jid.replace(/:[^@]+/, "").replace("@s.whatsapp.net", "");
    return { id: jid, name, phone };
  }

  async updateBusinessProfile(updates: Partial<BusinessProfile>): Promise<void> {
    if (updates.name) await this.socket.updateProfileName(updates.name);
    if (updates.about) await this.socket.updateProfileStatus(updates.about);
    if (updates.website) { /* not supported in personal */ }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private _toJid(id: string): string {
    if (id.includes("@")) return id;
    if (/^\d+$/.test(id)) return `${id}@s.whatsapp.net`;
    return id;
  }

  private _mapMessage(msg: proto.IWebMessageInfo): Message | null {
    if (!msg.key?.id || !msg.key?.remoteJid) return null;
    const content = msg.message;
    if (!content) return null;

    const text =
      content.conversation ??
      content.extendedTextMessage?.text ??
      content.imageMessage?.caption ??
      content.videoMessage?.caption ??
      content.documentMessage?.title ??
      undefined;

    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    const fromId = isGroup
      ? (msg.key.participant ?? msg.participant ?? msg.key.remoteJid)
      : (msg.key.fromMe ? (this.sock?.user?.id ?? "me") : msg.key.remoteJid);

    return {
      id: msg.key.id,
      chatId: msg.key.remoteJid,
      fromId: fromId!,
      fromName: msg.pushName ?? undefined,
      type: content.imageMessage ? "image"
        : content.videoMessage ? "video"
        : content.audioMessage ? "audio"
        : content.documentMessage ? "document"
        : content.stickerMessage ? "sticker"
        : content.locationMessage ? "location"
        : "text",
      text: text ?? undefined,
      quotedMessageId: content.extendedTextMessage?.contextInfo?.stanzaId ?? undefined,
      timestamp: Number(msg.messageTimestamp) * 1000,
      isGroup,
      isFromMe: msg.key.fromMe ?? false,
    };
  }

  private _storeMessage(msg: Message): void {
    try {
      const db = getDb();
      db.prepare(`
        INSERT OR IGNORE INTO messages
          (id, chat_id, from_id, from_name, type, text, media_id, media_url,
           mime_type, file_name, quoted_message_id, timestamp, is_group, is_from_me, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        msg.id, msg.chatId, msg.fromId, msg.fromName ?? null,
        msg.type, msg.text ?? null, msg.mediaId ?? null, msg.mediaUrl ?? null,
        msg.mimeType ?? null, msg.fileName ?? null, msg.quotedMessageId ?? null,
        msg.timestamp, msg.isGroup ? 1 : 0, msg.isFromMe ? 1 : 0, msg.status ?? "sent",
      );
    } catch { /* ignore duplicate */ }
  }

  private _rowToMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      chatId: row.chat_id as string,
      fromId: row.from_id as string,
      fromName: row.from_name as string | undefined,
      type: row.type as Message["type"],
      text: row.text as string | undefined,
      mediaId: row.media_id as string | undefined,
      mediaUrl: row.media_url as string | undefined,
      mimeType: row.mime_type as string | undefined,
      fileName: row.file_name as string | undefined,
      quotedMessageId: row.quoted_message_id as string | undefined,
      timestamp: row.timestamp as number,
      isGroup: Boolean(row.is_group),
      isFromMe: Boolean(row.is_from_me),
      status: row.status as Message["status"],
    };
  }

  private _mapGroup(g: { id: string; subject: string; desc?: string; participants: { id: string; admin?: string | null }[] }): Group {
    const members: GroupMember[] = g.participants.map((p) => ({
      id: p.id,
      isAdmin: p.admin === "admin" || p.admin === "superadmin",
      isSuperAdmin: p.admin === "superadmin",
    }));
    return { id: g.id, name: g.subject, description: g.desc, members };
  }

  private _rowToContact(row: Record<string, unknown>): Contact {
    return {
      id: row.id as string,
      name: row.name as string | undefined,
      pushName: row.push_name as string | undefined,
      businessName: row.business_name as string | undefined,
      phone: row.phone as string,
      pictureUrl: row.picture_url as string | undefined,
      statusMessage: row.status_message as string | undefined,
      isBlocked: Boolean(row.is_blocked),
    };
  }
}
