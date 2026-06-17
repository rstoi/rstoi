/**
 * Scraper do AntecipaFácil (conta corrente BMP) via Playwright/Chromium.
 *
 * Fluxo:
 *   1. Abre o Chromium restaurando a sessão salva (cookies/localStorage).
 *   2. Vai até a URL do painel. Autenticação:
 *        - modo `session` (padrão): login via OAuth (Google/Microsoft). Se a
 *          sessão salva não estiver ativa, aguarda o login interativo quando a
 *          janela está visível (BMP_HEADLESS=false); em headless, falha com
 *          orientação clara para gravar a sessão uma vez.
 *        - modo `password` (legado): preenche usuário/senha do ambiente.
 *   3. Navega até o extrato/movimentações (BMP_AF_EXTRATO_URL, se definido).
 *   4. Extrai as linhas da tabela em `LinhaExtrato[]`.
 *   5. Persiste a sessão para a próxima execução.
 *
 * Os SELETORES e ÍNDICES de coluna são parametrizáveis (ver `config.ts`),
 * pois a UI real do AntecipaFácil precisa ser inspecionada para ajuste fino.
 * Estrutura espelha o adaptador Playwright do WhatsApp (`src/adapters/playwright`).
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import type { BmpConfig } from "./config.js";
import type { LinhaExtrato } from "./types.js";

export class AntecipaFacilScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private sessionDir: string;
  private storageFile: string;

  constructor(private cfg: BmpConfig) {
    this.sessionDir = resolve(cfg.sessionDir);
    this.storageFile = resolve(this.sessionDir, "storage.json");
    mkdirSync(this.sessionDir, { recursive: true });
  }

  private detectChromium(): string | undefined {
    if (this.cfg.chromiumPath) return this.cfg.chromiumPath;
    const candidates = [
      "/opt/chromium/chrome-linux/chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ];
    for (const p of candidates) if (existsSync(p)) return p;
    return undefined; // Playwright usa o Chromium gerenciado
  }

  async connect(): Promise<void> {
    const hasSession = existsSync(this.storageFile);

    this.browser = await chromium.launch({
      headless: this.cfg.headless,
      executablePath: this.detectChromium(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.context = await this.browser.newContext({
      storageState: hasSession ? this.storageFile : undefined,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
      timezoneId: this.cfg.timezone,
    });

    this.page = await this.context.newPage();
    console.error(`[bmp] Abrindo ${this.cfg.url} …`);
    await this.page.goto(this.cfg.url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await this.ensureLoggedIn();

    // Persiste a sessão para as próximas execuções (evita relogar todo dia).
    await this.context.storageState({ path: this.storageFile });
    console.error("[bmp] Sessão salva ✓");
  }

  private async ensureLoggedIn(): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    if (await this.isLoggedIn()) {
      console.error("[bmp] Sessão restaurada — já autenticado ✓");
      return;
    }

    if (this.cfg.authMode === "password") {
      await this.loginComSenha();
    } else {
      await this.loginComSessaoOAuth();
    }
  }

  /**
   * Modo padrão: login via OAuth (Google/Microsoft). Não há como automatizar o
   * fluxo só com o e-mail — depende de senha + 2FA + consentimento. Em janela
   * visível, aguardamos o login manual e reaproveitamos a sessão; em headless,
   * orientamos a gravar a sessão uma vez.
   */
  private async loginComSessaoOAuth(): Promise<void> {
    if (this.cfg.headless) {
      throw new Error(
        "Sessão OAuth ausente/expirada e execução headless. Faça o login interativo uma vez para gravar a sessão:\n" +
          "  BMP_HEADLESS=false npm run bmp:sync\n" +
          `Depois, as execuções reaproveitam a sessão em ${this.sessionDir}.`,
      );
    }

    const minutos = Math.round(this.cfg.loginWaitMs / 60_000);
    console.error(
      `[bmp] Aguardando login OAuth (Google/Microsoft) na janela do navegador — até ${minutos} min…`,
    );

    const deadline = Date.now() + this.cfg.loginWaitMs;
    while (Date.now() < deadline) {
      if (await this.isLoggedIn()) {
        console.error("[bmp] Login concluído — autenticado ✓");
        return;
      }
      await this.page!.waitForTimeout(3_000);
    }
    throw new Error(
      "Tempo esgotado aguardando o login OAuth. Conclua o login na janela ou ajuste BMP_LOGIN_WAIT_MS/BMP_SEL_LOGGED_IN.",
    );
  }

  /** Modo legado: formulário usuário/senha (env BMP_AF_USER/PASSWORD). */
  private async loginComSenha(): Promise<void> {
    const userField = this.page!.locator(this.cfg.selectors.user).first();
    const hasLoginForm = await userField.count().then((c) => c > 0).catch(() => false);

    if (!hasLoginForm) {
      throw new Error(
        "Não autenticado e formulário de login não encontrado. Ajuste BMP_SEL_USER/PASSWORD/SUBMIT ou use BMP_AUTH_MODE=session.",
      );
    }
    if (!this.cfg.user || !this.cfg.password) {
      throw new Error("BMP_AF_USER/BMP_AF_PASSWORD não configurados — não é possível autenticar.");
    }

    console.error("[bmp] Preenchendo login (modo senha)…");
    await userField.fill(this.cfg.user);
    await this.page!.locator(this.cfg.selectors.password).first().fill(this.cfg.password);
    await this.page!.locator(this.cfg.selectors.submit).first().click();

    try {
      await this.page!.locator(this.cfg.selectors.loggedIn).first().waitFor({ timeout: 30_000 });
    } catch {
      /* segue para verificação abaixo */
    }

    if (!(await this.isLoggedIn())) {
      throw new Error(
        "Falha ao autenticar no AntecipaFácil (credenciais inválidas, 2F/MFA ou seletor 'loggedIn' incorreto).",
      );
    }
    console.error("[bmp] Autenticado ✓");
  }

  private async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    return this.page
      .locator(this.cfg.selectors.loggedIn)
      .first()
      .count()
      .then((c) => c > 0)
      .catch(() => false);
  }

  /** Extrai as linhas do extrato/movimentações da conta corrente BMP. */
  async scrapeMovimentacoes(): Promise<LinhaExtrato[]> {
    if (!this.page) throw new Error("Não conectado");

    if (this.cfg.extratoUrl) {
      console.error(`[bmp] Indo ao extrato: ${this.cfg.extratoUrl}`);
      await this.page.goto(this.cfg.extratoUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }

    // Aguarda a tabela renderizar (best-effort).
    await this.page
      .locator(this.cfg.selectors.row)
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => console.error("[bmp] aviso: nenhuma linha de extrato detectada no tempo esperado."));

    const { row, cell } = this.cfg.selectors;
    const col = this.cfg.colunas;

    const linhas = await this.page.evaluate(
      ({ rowSel, cellSel, col }) => {
        const text = (el: Element | null | undefined): string =>
          (el?.textContent ?? "").replace(/\s+/g, " ").trim();
        const at = (cells: Element[], i: number): string =>
          i >= 0 && i < cells.length ? text(cells[i]) : "";

        return Array.from(document.querySelectorAll(rowSel))
          .map((tr) => {
            const cells = Array.from(tr.querySelectorAll(cellSel));
            if (cells.length === 0) return null;
            return {
              data: at(cells, col.data),
              descricao: at(cells, col.descricao),
              documento: at(cells, col.documento) || undefined,
              valor: at(cells, col.valor),
              saldo: at(cells, col.saldo) || undefined,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null && (!!r.data || !!r.valor));
      },
      { rowSel: row, cellSel: cell, col },
    );

    console.error(`[bmp] ${linhas.length} linha(s) extraída(s) do extrato.`);
    return linhas;
  }

  async disconnect(): Promise<void> {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
