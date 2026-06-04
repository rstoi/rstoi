/**
 * WhatsApp Web Adapter — Playwright
 *
 * Connects to WhatsApp by automating web.whatsapp.com in a real Chromium
 * browser. No third-party WhatsApp library, no Meta/Facebook account.
 *
 * First run: saves QR code to ./data/qr.png + prints ASCII QR in terminal.
 * Subsequent runs: restores session automatically (no QR needed).
 *
 * Required: npx playwright install chromium
 *
 * Env vars (optional):
 *   WA_SESSION_DIR    — where to persist browser session (default: ./data/wa-session)
 *   WA_HEADLESS       — "false" to show browser window (default: true)
 *   WA_QR_PATH        — path to save QR code PNG (default: ./data/qr.png)
 *   WA_CHROMIUM_PATH  — path to Chromium executable (auto-detected if not set)
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import type {
  Message, Chat, Group, Contact,
  SendMessageOptions, SentMessage,
  PaginationOpts, GroupUpdate,
  BusinessProfile, MediaUploadResult,
} from "../../types/index.js";
import { WhatsAppAdapter } from "../base.js";
import { getDb } from "../../store/db.js";

export class PlaywrightClient extends WhatsAppAdapter {
  private browser:  Browser  | null = null;
  private context:  BrowserContext | null = null;
  private page:     Page     | null = null;
  private connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private sessionDir:     string;
  private headless:       boolean;
  private qrPath:         string;
  private executablePath: string | undefined;

  constructor() {
    super();
    this.sessionDir     = resolve(process.env.WA_SESSION_DIR ?? "./data/wa-session");
    this.headless       = process.env.WA_HEADLESS !== "false";
    this.qrPath         = resolve(process.env.WA_QR_PATH ?? "./data/qr.png");
    this.executablePath = process.env.WA_CHROMIUM_PATH ?? this.detectChromium();
    mkdirSync(this.sessionDir, { recursive: true });
    mkdirSync(resolve("./data"), { recursive: true });
  }

  private detectChromium(): string | undefined {
    const candidates = [
      "/opt/chromium/chrome-linux/chrome",          // downloaded by setup
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of candidates) {
      if (existsSync(p)) { console.error(`[playwright] Using Chromium: ${p}`); return p; }
    }
    return undefined; // playwright will use its own managed browser
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    console.error("[playwright] Launching Chromium…");

    const storageFile = resolve(this.sessionDir, "storage.json");
    const hasSession  = existsSync(storageFile);

    this.browser = await chromium.launch({
      headless: this.headless,
      executablePath: this.executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.context = await this.browser.newContext({
      storageState:    hasSession ? storageFile : undefined,
      userAgent:       "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport:        { width: 1280, height: 800 },
      locale:          "pt-BR",
      timezoneId:      "America/Sao_Paulo",
    });

    this.page = await this.context.newPage();
    await this.page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

    if (!hasSession) {
      await this.waitForQR();
    }

    await this.waitForLogin();
    await this.context.storageState({ path: storageFile });

    this.connected = true;
    console.error("[playwright] Connected to WhatsApp Web ✓");
    this.startPolling();
  }

  private async waitForQR(): Promise<void> {
    console.error("[playwright] Waiting for QR code…");

    await this.page!.waitForSelector("canvas", { timeout: 30_000 });

    const canvas = this.page!.locator("canvas").first();
    const qrDataUrl = await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    writeFileSync(this.qrPath, Buffer.from(base64, "base64"));

    // Print ASCII QR in terminal (requires qrencode CLI if available)
    try {
      const qrText = await this.page!.evaluate(() => {
        const el = document.querySelector('[data-ref]') as HTMLElement | null;
        return el?.dataset["ref"] ?? "";
      });
      if (qrText) {
        try {
          const ascii = execSync(`echo '${qrText}' | qrencode -t UTF8 -o -`, { encoding: "utf8" });
          console.error("\n" + ascii);
        } catch { /**/ }
      }
    } catch { /**/ }

    console.error(`[playwright] ┌──────────────────────────────────────────────────┐`);
    console.error(`[playwright] │  Escaneie o QR code abaixo com seu celular        │`);
    console.error(`[playwright] │  QR PNG salvo em: ${this.qrPath.padEnd(30)} │`);
    console.error(`[playwright] │  WhatsApp → Dispositivos vinculados → + Linkar    │`);
    console.error(`[playwright] └──────────────────────────────────────────────────┘`);
  }

  private async waitForLogin(): Promise<void> {
    console.error("[playwright] Waiting for WhatsApp to load (scan QR if prompted)…");
    // Wait for the chat list to appear — means we're authenticated
    await this.page!.waitForSelector(
      'div[aria-label="Lista de conversas"], div[aria-label="Chat list"], [data-testid="chat-list"]',
      { timeout: 120_000 },
    );
    console.error("[playwright] Chat list visible — authenticated ✓");
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    await this.browser?.close();
    this.browser  = null;
    this.context  = null;
    this.page     = null;
    this.connected = false;
  }

  isConnected(): boolean { return this.connected; }

  // ── Message polling ───────────────────────────────────────────────────────

  private startPolling(): void {
    this.pollTimer = setInterval(() => this.pollMessages().catch(console.error), 3000);
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async pollMessages(): Promise<void> {
    if (!this.page || !this.connected) return;

    try {
      // Collect unread chat snippets from sidebar
      const chats = await this.page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[data-testid="cell-frame-container"]'));
        return items.slice(0, 20).map(el => {
          const title    = el.querySelector('[data-testid="cell-frame-title"]')?.textContent?.trim() ?? "";
          const snippet  = el.querySelector('[data-testid="last-msg-status"]')?.nextElementSibling?.textContent?.trim() ?? "";
          const unread   = el.querySelector('[aria-label*="unread"], [data-testid="icon-unread-count"]')?.textContent?.trim();
          return { title, snippet, unread: unread ? parseInt(unread, 10) : 0 };
        });
      });

      const db = getDb();
      for (const chat of chats.filter(c => c.unread > 0)) {
        await this.openChat(chat.title);
        await this.scrapeOpenChat();
      }
    } catch { /**/ }
  }

  private async openChat(nameOrPhone: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const searchBtn = this.page.locator('[data-testid="search"], [aria-label="Search or start new chat"]').first();
      await searchBtn.click();
      await this.page.keyboard.type(nameOrPhone, { delay: 30 });
      await this.page.waitForTimeout(800);
      const first = this.page.locator('[data-testid="cell-frame-container"]').first();
      await first.click();
      await this.page.waitForTimeout(500);
      return true;
    } catch {
      return false;
    }
  }

  private async scrapeOpenChat(): Promise<void> {
    if (!this.page) return;
    try {
      const msgs = await this.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid="msg-container"]'));
        return rows.slice(-20).map(el => {
          const isOut  = !!el.closest('[data-testid="msg-container"]')?.querySelector('[data-testid="msg-meta"]');
          const text   = el.querySelector('[data-testid="conversation-compose-box-input"], .selectable-text')?.textContent?.trim() ?? "";
          const ts     = el.querySelector('[data-testid="msg-meta"] span[dir]')?.textContent?.trim() ?? "";
          const chatId = (window.location.hash || "").replace("#", "");
          return { text, ts, isFromMe: isOut, chatId };
        }).filter(m => m.text);
      });

      const db = getDb();
      for (const m of msgs) {
        const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        db.prepare(`
          INSERT OR IGNORE INTO messages
            (id, chat_id, from_id, type, text, timestamp, is_group, is_from_me, status)
          VALUES (?, ?, ?, 'text', ?, ?, 0, ?, 'received')
        `).run(id, m.chatId || "unknown", m.isFromMe ? "me" : "contact", m.text, Date.now(), m.isFromMe ? 1 : 0);
      }
    } catch { /**/ }
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage> {
    if (!this.page) throw new Error("Not connected");

    // Normalize: strip @s.whatsapp.net, keep digits
    const target = to.replace(/@.*$/, "").replace(/\D/g, "");
    if (!target) throw new Error("Invalid phone number: " + to);

    // Open chat via direct URL (most reliable)
    const text = opts.text ?? "";
    await this.page.goto(
      `https://web.whatsapp.com/send?phone=${target}&text=${encodeURIComponent(text)}`,
      { waitUntil: "domcontentloaded" },
    );

    // Wait for message input
    const input = this.page.locator(
      '[data-testid="conversation-compose-box-input"], [contenteditable="true"][title*="message" i]',
    ).first();
    await input.waitFor({ timeout: 20_000 });

    // Send
    await input.click();
    if (!text) await input.fill(opts.text ?? "");
    await this.page.keyboard.press("Enter");
    await this.page.waitForTimeout(500);

    const id = `wa-sent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ts = Date.now();
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO messages
        (id, chat_id, from_id, type, text, timestamp, is_group, is_from_me, status)
      VALUES (?, ?, 'me', 'text', ?, ?, 0, 1, 'sent')
    `).run(id, to, text, ts);

    return { id, timestamp: ts };
  }

  async editMessage(_messageId: string, _chatId: string, _newText: string): Promise<void> {
    const db = getDb();
    db.prepare("UPDATE messages SET text = ? WHERE id = ?").run(_newText, _messageId);
  }

  async deleteMessage(messageId: string, _chatId: string, _forEveryone = true): Promise<void> {
    const db = getDb();
    db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  }

  async reactToMessage(_messageId: string, _chatId: string, _emoji: string): Promise<void> { /**/ }

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
    const db = getDb();
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
    return row ? rowToMessage(row as Record<string, unknown>) : null;
  }

  async listChats(): Promise<Chat[]> {
    // Live from page if connected
    if (this.page && this.connected) {
      try {
        const live = await this.page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('[data-testid="cell-frame-container"]'));
          return items.slice(0, 50).map(el => ({
            id:   el.querySelector('[data-testid="cell-frame-title"]')?.textContent?.trim() ?? "",
            name: el.querySelector('[data-testid="cell-frame-title"]')?.textContent?.trim() ?? "",
            unread: parseInt(
              el.querySelector('[data-testid="icon-unread-count"]')?.textContent?.trim() ?? "0", 10
            ),
          }));
        });
        return live.filter(c => c.id).map(c => ({
          id: c.id, name: c.name, isGroup: false, unreadCount: c.unread,
        }));
      } catch { /**/ }
    }
    // Fallback to SQLite
    const db = getDb();
    const rows = db.prepare(`
      SELECT chat_id, MAX(timestamp) AS last_ts,
             SUM(CASE WHEN is_from_me=0 AND status!='read' THEN 1 ELSE 0 END) AS unread
      FROM messages GROUP BY chat_id ORDER BY last_ts DESC
    `).all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: r["chat_id"] as string, name: r["chat_id"] as string,
      isGroup: (r["chat_id"] as string).endsWith("@g.us"),
      lastMessageAt: r["last_ts"] as number, unreadCount: r["unread"] as number,
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

  async createGroup(name: string, participants: string[]): Promise<Group> {
    // DOM automation: create group via WhatsApp Web UI
    if (this.page && this.connected) {
      try {
        // Click new group button — implementation would automate the UI
        // For now, create locally and sync
        console.error("[playwright] createGroup via UI not yet automated — creating locally");
      } catch { /**/ }
    }
    const db = getDb();
    const id      = `group-${Date.now()}@g.us`;
    const members = participants.map(p => ({ id: p, name: p, isAdmin: false }));
    db.prepare("INSERT INTO groups (id, name, members, created_at) VALUES (?, ?, ?, ?)")
      .run(id, name, JSON.stringify(members), Date.now());
    return { id, name, members, createdAt: Date.now() };
  }

  async updateGroup(groupId: string, updates: GroupUpdate): Promise<void> {
    const db = getDb();
    if (updates.name) db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(updates.name, groupId);
  }

  async addGroupMember(groupId: string, phone: string): Promise<void> {
    const g = await this.getGroup(groupId);
    if (!g) return;
    const db = getDb();
    db.prepare("UPDATE groups SET members = ? WHERE id = ?")
      .run(JSON.stringify([...g.members, { id: phone, name: phone, isAdmin: false }]), groupId);
  }

  async removeGroupMember(groupId: string, phone: string): Promise<void> {
    const g = await this.getGroup(groupId);
    if (!g) return;
    const db = getDb();
    db.prepare("UPDATE groups SET members = ? WHERE id = ?")
      .run(JSON.stringify(g.members.filter(m => m.id !== phone)), groupId);
  }

  async promoteGroupMember(groupId: string, phone: string): Promise<void> {
    const g = await this.getGroup(groupId);
    if (!g) return;
    const db = getDb();
    db.prepare("UPDATE groups SET members = ? WHERE id = ?")
      .run(JSON.stringify(g.members.map(m => m.id === phone ? { ...m, isAdmin: true } : m)), groupId);
  }

  async demoteGroupMember(groupId: string, phone: string): Promise<void> {
    const g = await this.getGroup(groupId);
    if (!g) return;
    const db = getDb();
    db.prepare("UPDATE groups SET members = ? WHERE id = ?")
      .run(JSON.stringify(g.members.map(m => m.id === phone ? { ...m, isAdmin: false } : m)), groupId);
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.removeGroupMember(groupId, "me");
  }

  async getGroupInviteLink(_groupId: string): Promise<string> {
    return `https://chat.whatsapp.com/invite`;
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(): Promise<Contact[]> {
    if (this.page && this.connected) {
      try {
        // Scrape contacts from WhatsApp Web sidebar
        const items = await this.page.evaluate(() => {
          return Array.from(document.querySelectorAll('[data-testid="cell-frame-container"]'))
            .slice(0, 100)
            .map(el => ({
              name: el.querySelector('[data-testid="cell-frame-title"]')?.textContent?.trim() ?? "",
            }))
            .filter(c => c.name);
        });
        return items.map((c, i) => ({
          id: `contact-${i}`, name: c.name, phone: c.name, isBlocked: false,
        }));
      } catch { /**/ }
    }
    const db = getDb();
    return (db.prepare("SELECT * FROM contacts").all() as Record<string, unknown>[]).map(rowToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const db = getDb();
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

  async uploadMedia(_buffer: Buffer, mimeType: string, _fileName?: string): Promise<MediaUploadResult> {
    return { mediaId: `local-media-${Date.now()}`, mimeType };
  }

  async downloadMedia(_mediaId: string): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getBusinessProfile(): Promise<BusinessProfile> {
    if (this.page && this.connected) {
      try {
        const name = await this.page.evaluate(() => {
          return document.querySelector('[data-testid="profile-name"]')?.textContent?.trim() ?? "";
        });
        if (name) return { id: "me", name, phone: "" };
      } catch { /**/ }
    }
    return { id: "me", name: process.env.WA_BUSINESS_NAME ?? "WhatsApp", phone: "" };
  }

  async updateBusinessProfile(_updates: Partial<BusinessProfile>): Promise<void> { /**/ }

  // ── Webhook ───────────────────────────────────────────────────────────────

  verifyWebhook(token: string, challenge: string): string {
    if (token !== (process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "")) throw new Error("Invalid token");
    return challenge;
  }

  async processWebhookPayload(_payload: unknown): Promise<void> { /**/ }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

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
    id:          r["id"]           as string,
    name:        r["name"]         as string,
    description: (r["description"] as string | null) ?? undefined,
    members:     JSON.parse((r["members"] as string | null) ?? "[]") as Group["members"],
    createdAt:   (r["created_at"]  as number | null) ?? undefined,
    inviteLink:  (r["invite_link"] as string | null) ?? undefined,
  };
}

function rowToContact(r: Record<string, unknown>): Contact {
  return {
    id:            r["id"]              as string,
    name:          (r["name"]           as string | null) ?? undefined,
    pushName:      (r["push_name"]      as string | null) ?? undefined,
    phone:         (r["phone"]          as string | null) ?? (r["id"] as string),
    statusMessage: (r["status_message"] as string | null) ?? undefined,
    isBlocked:     Boolean(r["is_blocked"]),
  };
}
