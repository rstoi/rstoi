/**
 * X (Twitter) Adapter — Playwright
 *
 * Automatiza x.com num Chromium real para postar EM NOME do dono da conta
 * (@rtoi), sem usar a API oficial. Espelha o padrão do PlaywrightClient do
 * WhatsApp: persiste a sessão logada via storageState e a restaura nas próximas
 * execuções.
 *
 * IMPORTANTE: o X não tem login por QR. O primeiro login é manual e feito pelo
 * `scripts/x-connect.ts` (headed, no DISPLAY=:99). Aqui só restauramos a sessão;
 * se ela expirou, sinalizamos para o operador rodar `npm run x-connect`.
 *
 * Variáveis de ambiente:
 *   X_SESSION_DIR     — onde persistir a sessão do browser (default ./data/x-session)
 *   X_HEADLESS        — "false" para abrir a janela do browser (default true)
 *   X_USERNAME        — handle sem @ (ex.: rtoi), usado p/ verificar login e ler perfil
 *   X_DRY_RUN         — "true" => não publica de verdade (loga e retorna URL fake)
 *   X_CHROMIUM_PATH   — caminho do Chromium (auto-detectado se ausente)
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { recordPost } from "../../x-approval.js";

export interface XPost {
  id: string;
  url: string;
  author: string;
  text: string;
  timestamp?: string;
}

export interface PostResult {
  url: string;
  id: string;
}

// Seletores do x.com centralizados — ponto único de conserto quando a UI mudar.
const SELECTORS = {
  composeBtn:     '[data-testid="SideNav_NewTweet_Button"]',
  loggedInMarker: '[data-testid="SideNav_NewTweet_Button"], [data-testid="AppTabBar_Home_Link"]',
  textarea:       (i: number) => `[data-testid="tweetTextarea_${i}"]`,
  textareaFirst:  '[data-testid="tweetTextarea_0"]',
  tweetButton:    '[data-testid="tweetButton"]',
  tweetButtonInline: '[data-testid="tweetButtonInline"]',
  addButton:      '[data-testid="addButton"]',
  toast:          '[data-testid="toast"]',
  reply:          '[data-testid="reply"]',
  retweet:        '[data-testid="retweet"]',
  retweetConfirm: '[data-testid="retweetConfirm"]',
  like:           '[data-testid="like"]',
  unlike:         '[data-testid="unlike"]',
  tweetArticle:   'article[data-testid="tweet"]',
  tweetText:      '[data-testid="tweetText"]',
  userName:       '[data-testid="User-Name"]',
};

export class XClient {
  private browser:  Browser | null = null;
  private context:  BrowserContext | null = null;
  private page:     Page | null = null;
  private connected = false;

  private sessionDir:     string;
  private headless:       boolean;
  private username:       string;
  private dryRun:         boolean;
  private executablePath: string | undefined;

  constructor() {
    this.sessionDir     = resolve(process.env.X_SESSION_DIR ?? "./data/x-session");
    this.headless       = process.env.X_HEADLESS !== "false";
    this.username       = (process.env.X_USERNAME ?? "").replace(/^@/, "");
    this.dryRun         = process.env.X_DRY_RUN === "true";
    this.executablePath = process.env.X_CHROMIUM_PATH ?? this.detectChromium();
    mkdirSync(this.sessionDir, { recursive: true });
  }

  isDryRun(): boolean { return this.dryRun; }

  // Mesmos candidatos do adaptador de WhatsApp (mantém consistência no host).
  private detectChromium(): string | undefined {
    const candidates = [
      "/opt/chromium/chrome-linux/chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of candidates) {
      if (existsSync(p)) { console.error(`[x] Using Chromium: ${p}`); return p; }
    }
    return undefined; // playwright usa o browser gerenciado dele
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    console.error("[x] Launching Chromium…");
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
      storageState: hasSession ? storageFile : undefined,
      userAgent:    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport:     { width: 1280, height: 900 },
      locale:       "pt-BR",
      timezoneId:   "America/Sao_Paulo",
    });

    this.page = await this.context.newPage();
    await this.page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

    const ok = await this.waitForLogin(30_000);
    if (!ok) {
      const reason = hasSession
        ? "Sessão do X expirada. Rode `npm run x-connect` para logar novamente."
        : "Sem sessão do X. Rode `npm run x-connect` para o login inicial.";
      throw new Error(reason);
    }

    // Re-salva a sessão (renova cookies) — mesmo padrão do WhatsApp.
    await this.context.storageState({ path: storageFile });
    this.connected = true;
    console.error(`[x] Conectado ao X ✓${this.dryRun ? " (DRY-RUN: não publica)" : ""}`);
  }

  async disconnect(): Promise<void> {
    await this.browser?.close();
    this.browser = null; this.context = null; this.page = null;
    this.connected = false;
  }

  isConnected(): boolean { return this.connected; }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    return this.page.evaluate((sel) => Boolean(document.querySelector(sel)),
      SELECTORS.loggedInMarker).catch(() => false);
  }

  private async waitForLogin(timeout = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.isLoggedIn()) return true;
      await this.page!.waitForTimeout(1_500);
    }
    return false;
  }

  private ensurePage(): Page {
    if (!this.page || !this.connected) throw new Error("X não conectado. Rode connect() primeiro.");
    return this.page;
  }

  // ── Composição (helpers) ───────────────────────────────────────────────────

  /** Insere texto numa caixa do compositor sem disparar autocomplete de @/#. */
  private async fillBox(index: number, text: string): Promise<void> {
    const page = this.ensurePage();
    const box = page.locator(SELECTORS.textarea(index)).first();
    await box.waitFor({ timeout: 15_000 });
    await box.click();
    await page.keyboard.insertText(text);
    await page.waitForTimeout(200);
  }

  /** Clica o botão de publicar (modal ou inline) e espera assentar. */
  private async clickPost(): Promise<void> {
    const page = this.ensurePage();
    // Pequeno atraso "humano" antes de publicar.
    await page.waitForTimeout(400 + Math.floor(Math.random() * 400));
    const btn = page.locator(`${SELECTORS.tweetButton}, ${SELECTORS.tweetButtonInline}`).first();
    await btn.waitFor({ timeout: 15_000 });
    await btn.click();
    await page.waitForTimeout(1_500);
  }

  /** Abre o compositor principal (modal) via atalho de teclado "n". */
  private async openComposer(): Promise<void> {
    const page = this.ensurePage();
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.keyboard.press("n");
    await page.locator(SELECTORS.textareaFirst).first().waitFor({ timeout: 10_000 });
  }

  /** Captura a URL do último post publicado pelo próprio usuário. */
  private async captureLatestUrl(): Promise<string> {
    const page = this.ensurePage();
    if (!this.username) return "";
    try {
      await page.goto(`https://x.com/${this.username}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_500);
      const href = await page.locator(`${SELECTORS.tweetArticle} a[href*="/status/"]`)
        .first().getAttribute("href").catch(() => null);
      return href ? new URL(href, "https://x.com").toString() : "";
    } catch { return ""; }
  }

  private fakeResult(text: string, kind: string): PostResult {
    const id = `dry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    console.error(`[x][DRY-RUN] ${kind}: ${text.slice(0, 120)}…`);
    return { id, url: `https://x.com/${this.username || "rtoi"}/status/${id}` };
  }

  private idFromUrl(url: string): string {
    return url.match(/status\/(\d+)/)?.[1] ?? `x-${Date.now()}`;
  }

  // ── Publicação ──────────────────────────────────────────────────────────────

  async postTweet(text: string): Promise<PostResult> {
    if (this.dryRun) return this.fakeResult(text, "tweet");
    await this.openComposer();
    await this.fillBox(0, text);
    await this.clickPost();
    const url = await this.captureLatestUrl();
    const result = { url, id: this.idFromUrl(url) };
    recordPost({ id: result.id, url, text, kind: "tweet", source: "posted" });
    return result;
  }

  async postThread(tweets: string[]): Promise<PostResult> {
    const parts = tweets.filter((t) => t.trim());
    if (parts.length === 0) throw new Error("Thread vazia.");
    if (parts.length === 1) return this.postTweet(parts[0]);
    if (this.dryRun) return this.fakeResult(parts.join(" || "), `thread(${parts.length})`);

    const page = this.ensurePage();
    try {
      await this.openComposer();
      await this.fillBox(0, parts[0]);
      for (let i = 1; i < parts.length; i++) {
        await page.locator(SELECTORS.addButton).first().click();
        await this.fillBox(i, parts[i]);
      }
      await this.clickPost();
      const url = await this.captureLatestUrl();
      const result = { url, id: this.idFromUrl(url) };
      recordPost({ id: result.id, url, text: parts.join("\n\n"), kind: "thread", source: "posted" });
      return result;
    } catch (err) {
      // Fallback: posta o 1º e encadeia respostas (caso o addButton tenha mudado).
      console.error("[x] addButton falhou, usando fallback de respostas encadeadas:", err);
      const first = await this.postTweet(parts[0]);
      let prev = first.url;
      for (let i = 1; i < parts.length; i++) {
        const r = await this.reply(prev, parts[i]);
        prev = r.url || prev;
      }
      return first;
    }
  }

  async reply(tweetUrl: string, text: string): Promise<PostResult> {
    if (this.dryRun) return this.fakeResult(`@${tweetUrl}: ${text}`, "reply");
    const page = this.ensurePage();
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
    await page.locator(SELECTORS.reply).first().click();
    await this.fillBox(0, text);
    await this.clickPost();
    const url = await this.captureLatestUrl();
    const result = { url, id: this.idFromUrl(url || tweetUrl) };
    recordPost({ id: result.id, url, text, kind: "reply", source: "posted" });
    return result;
  }

  async quote(tweetUrl: string, text: string): Promise<PostResult> {
    if (this.dryRun) return this.fakeResult(`quote ${tweetUrl}: ${text}`, "quote");
    const page = this.ensurePage();
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
    await page.locator(SELECTORS.retweet).first().click();
    // Menu "Quote"/"Citar" (label depende do locale).
    const item = page.locator('[role="menuitem"]').filter({ hasText: /quote|citar/i }).first();
    await item.click({ timeout: 10_000 });
    await this.fillBox(0, text);
    await this.clickPost();
    const url = await this.captureLatestUrl();
    const result = { url, id: this.idFromUrl(url || tweetUrl) };
    recordPost({ id: result.id, url, text, kind: "quote", source: "posted" });
    return result;
  }

  async repost(tweetUrl: string): Promise<void> {
    if (this.dryRun) { console.error(`[x][DRY-RUN] repost: ${tweetUrl}`); return; }
    const page = this.ensurePage();
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
    await page.locator(SELECTORS.retweet).first().click();
    await page.locator(SELECTORS.retweetConfirm).first().click({ timeout: 10_000 });
    await page.waitForTimeout(800);
    recordPost({ id: `repost-${this.idFromUrl(tweetUrl)}`, url: tweetUrl, kind: "repost", source: "posted" });
  }

  async like(tweetUrl: string): Promise<void> {
    if (this.dryRun) { console.error(`[x][DRY-RUN] like: ${tweetUrl}`); return; }
    const page = this.ensurePage();
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
    // Idempotente: se já curtido, o botão é "unlike" — não faz nada.
    const likeBtn = page.locator(SELECTORS.like).first();
    if (await likeBtn.count() > 0) {
      await likeBtn.click();
      await page.waitForTimeout(600);
    }
    recordPost({ id: `like-${this.idFromUrl(tweetUrl)}`, url: tweetUrl, kind: "like", source: "posted" });
  }

  // ── Leitura ─────────────────────────────────────────────────────────────────

  async getMentions(limit = 15): Promise<XPost[]> {
    return this.scrapeFeed("https://x.com/notifications/mentions", limit, "mention");
  }

  async getTimeline(limit = 15): Promise<XPost[]> {
    return this.scrapeFeed("https://x.com/home", limit, "timeline");
  }

  private async scrapeFeed(url: string, limit: number, source: string): Promise<XPost[]> {
    const page = this.ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    const seen = new Set<string>();
    const out: XPost[] = [];

    for (let scroll = 0; scroll < 8 && out.length < limit; scroll++) {
      const batch = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel.tweetArticle)).map((el) => {
          const text = el.querySelector(sel.tweetText)?.textContent?.trim() ?? "";
          const author = el.querySelector(sel.userName)?.textContent?.trim() ?? "";
          const anchor = Array.from(el.querySelectorAll('a[href*="/status/"]'))
            .find((a) => a.querySelector("time")) as HTMLAnchorElement | undefined;
          const href = anchor?.getAttribute("href") ?? "";
          const timestamp = el.querySelector("time")?.getAttribute("datetime") ?? "";
          return { text, author, href, timestamp };
        });
      }, SELECTORS);

      for (const b of batch) {
        if (!b.href) continue;
        const id = b.href.match(/status\/(\d+)/)?.[1] ?? b.href;
        if (seen.has(id)) continue;
        seen.add(id);
        const post: XPost = {
          id,
          url: new URL(b.href, "https://x.com").toString(),
          author: b.author,
          text: b.text,
          timestamp: b.timestamp,
        };
        out.push(post);
        recordPost({ id, url: post.url, author: post.author, text: post.text, kind: "read", source });
        if (out.length >= limit) break;
      }

      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(1_200);
    }

    return out.slice(0, limit);
  }
}
