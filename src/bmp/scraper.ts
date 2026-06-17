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
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import type { BmpConfig } from "./config.js";
import type { LinhaExtrato } from "./types.js";

/** Link encontrado durante a exploração do app. */
export interface LinkApp {
  texto: string;
  href: string;
  /** True quando texto/href sugerem extrato/conta/movimentações do BMP. */
  candidato: boolean;
}

/** Tabela inspecionada em uma página. */
export interface TabelaApp {
  headers: string[];
  amostra: string[][];
  linhas: number;
}

/** Página visitada durante a exploração. */
export interface PaginaApp {
  url: string;
  titulo: string;
  tabelas: TabelaApp[];
  screenshot: string;
  html: string;
}

export interface ResultadoExploracao {
  links: LinkApp[];
  paginas: PaginaApp[];
  /** Sugestão de configuração para o extrato do BMP, se detectado. */
  sugestao?: {
    extratoUrl: string;
    colunas: Partial<BmpConfig["colunas"]>;
    headers: string[];
  };
}

const RX_CANDIDATO = /extrato|conta|saldo|movimenta|lan[çc]amento|transa|bmp/i;

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

  /** True quando o navegador é externo (CDP) — não devemos fechá-lo. */
  private externo = false;

  async connect(): Promise<void> {
    if (this.cfg.connectMode === "cdp") {
      await this.connectViaCdp();
    } else {
      await this.connectViaLaunch();
    }
  }

  /**
   * Abordagem do blueprint: ANEXA-SE a um Chrome já aberto e AUTENTICADO via
   * CDP (remote-debugging). Não digita credenciais. Seleciona a aba que está
   * no domínio do app (equivalente ao `select_browser`); se só houver tela de
   * login, orienta o usuário a abrir/escolher o navegador certo.
   */
  private async connectViaCdp(): Promise<void> {
    console.error(`[bmp] Conectando ao navegador autenticado via CDP: ${this.cfg.cdpUrl}`);
    try {
      this.browser = await chromium.connectOverCDP(this.cfg.cdpUrl);
    } catch (e) {
      throw new Error(
        `Não consegui conectar ao Chrome em ${this.cfg.cdpUrl}. Abra o Chrome com remote-debugging e já logado no AntecipaFácil:\n` +
          `  google-chrome --remote-debugging-port=9222 --user-data-dir=$HOME/.bmp-chrome\n` +
          `Depois faça login em ${this.cfg.url} nessa janela. Detalhe: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    this.externo = true;
    this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());
    this.page = await this.selecionarAbaAutenticada(this.context);

    if (!(await this.isLoggedIn())) {
      throw new Error(
        "O navegador conectado não está autenticado no AntecipaFácil (caí na tela de login). " +
          "Garanta que a aba logada vive NESTE Chrome (a sessão pode estar em outro navegador, ex.: Edge vs Chrome) " +
          "e não digito credenciais — abra/escolha o navegador correto e tente de novo.",
      );
    }
    console.error("[bmp] Navegador autenticado conectado ✓");
  }

  /** Escolhe a aba já no domínio do app; senão usa/abre uma e navega até ele. */
  private async selecionarAbaAutenticada(ctx: BrowserContext): Promise<Page> {
    const host = new URL(this.cfg.url).host;
    for (const p of ctx.pages()) {
      try {
        if (new URL(p.url()).host.includes(host.replace(/^www\./, ""))) return p;
      } catch {
        /* ignora abas about:blank etc. */
      }
    }
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(this.cfg.url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    return page;
  }

  /** Abre um Chromium próprio (sessão salva OAuth ou login por senha). */
  private async connectViaLaunch(): Promise<void> {
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

  /**
   * Workflow B do blueprint — extrai o extrato da CONTA CONSIGNADA (escrow,
   * Banco Money Plus): abre `/escrow-account`, amplia o período (data inicial/
   * final) → Buscar, e PAGINA lendo a tabela página a página. Refs de DOM
   * expiram a cada render, então relocalizamos o botão "próxima" a cada volta.
   *
   * Somente leitura — não submete cadastros, não move dinheiro (guardrails).
   */
  async scrapeContaConsignada(): Promise<LinhaExtrato[]> {
    if (!this.page) throw new Error("Não conectado");
    const page = this.page;

    console.error(`[bmp] Conta consignada: ${this.cfg.escrowUrl}`);
    await page.goto(this.cfg.escrowUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});

    // 1) Período (best-effort: só se os campos existirem).
    await this.preencherPeriodo();

    // 2) Buscar.
    const buscar = page.locator(this.cfg.selectors.buscar).first();
    if (await buscar.count().then((c) => c > 0).catch(() => false)) {
      await buscar.click().catch(() => {});
      await page.waitForTimeout(1_500);
    }

    // 3) Paginação — acumula linhas, deduplicando por conteúdo de linha.
    const todas: LinhaExtrato[] = [];
    const vistas = new Set<string>();
    for (let pg = 1; pg <= this.cfg.maxPaginas; pg++) {
      await page
        .locator(this.cfg.selectors.row)
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => {});
      const linhas = await this.lerLinhasDaPagina();
      let novas = 0;
      for (const l of linhas) {
        const chave = `${l.data}|${l.descricao}|${l.valor}|${l.saldo ?? ""}`;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        todas.push(l);
        novas++;
      }
      console.error(`[bmp] página ${pg}: ${linhas.length} linha(s), ${novas} nova(s) (total ${todas.length}).`);

      // Relocaliza o "próxima" a cada iteração (refs expiram após o render).
      const proxima = page.locator(this.cfg.selectors.proxima).first();
      const temProxima = await proxima.count().then((c) => c > 0).catch(() => false);
      const habilitada = temProxima && (await proxima.isEnabled().catch(() => false));
      if (!habilitada || novas === 0) break;
      await proxima.click().catch(() => {});
      await page.waitForTimeout(1_200);
    }

    console.error(`[bmp] Conta consignada: ${todas.length} linha(s) no total.`);
    return todas;
  }

  /** Preenche data inicial/final do período, se a tela tiver os campos. */
  private async preencherPeriodo(): Promise<void> {
    const page = this.page!;
    const set = async (sel: string, valor?: string) => {
      if (!valor) return;
      const f = page.locator(sel).first();
      if (await f.count().then((c) => c > 0).catch(() => false)) {
        await f.fill(this.formatarDataCampo(valor)).catch(() => {});
      }
    };
    await set(this.cfg.selectors.periodoInicio, this.cfg.periodoInicio);
    await set(this.cfg.selectors.periodoFim, this.cfg.periodoFim);
  }

  /** input[type=date] usa ISO; demais campos costumam usar dd/mm/aaaa. */
  private formatarDataCampo(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? iso : iso; // mantém ISO; o fill aceita ISO em date inputs
  }

  /** Lê as linhas da tabela atual usando os seletores/colunas configurados. */
  private async lerLinhasDaPagina(): Promise<LinhaExtrato[]> {
    const { row, cell } = this.cfg.selectors;
    const col = this.cfg.colunas;
    return this.page!.evaluate(
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
  }

  /**
   * Percorre o app logado (somente leitura) para LOCALIZAR as transações do
   * BMP: lista os links de menu, visita os candidatos (extrato/conta/saldo/
   * movimentações) e inspeciona as tabelas (cabeçalhos + amostra). Salva
   * screenshots e HTML em `outDir` e sugere `BMP_AF_EXTRATO_URL` + colunas.
   *
   * Não executa nenhuma operação bancária — apenas navega e lê.
   */
  async explorar(outDir: string): Promise<ResultadoExploracao> {
    if (!this.page) throw new Error("Não conectado");
    mkdirSync(outDir, { recursive: true });

    // 1) Mapa de links do app (a partir do dashboard).
    const links = await this.coletarLinks();
    const candidatos = links.filter((l) => l.candidato);
    console.error(`[bmp] ${links.length} link(s); ${candidatos.length} candidato(s) a extrato/conta.`);

    // 2) Visita o dashboard + os candidatos (dedup de href, no máx. 12 páginas).
    const alvos = [this.page.url(), ...candidatos.map((c) => c.href)];
    const vistos = new Set<string>();
    const paginas: PaginaApp[] = [];

    for (const url of alvos) {
      const abs = this.absolutizar(url);
      if (!abs || vistos.has(abs)) continue;
      vistos.add(abs);
      if (paginas.length >= 12) break;
      const pag = await this.inspecionarPagina(abs, outDir, paginas.length);
      if (pag) paginas.push(pag);
    }

    // 3) Sugestão: melhor tabela que pareça um extrato (tem data + valor).
    const sugestao = this.derivarSugestao(paginas);

    writeFileSync(
      join(outDir, "exploracao.json"),
      JSON.stringify({ links, paginas, sugestao }, null, 2),
    );
    console.error(`[bmp] Exploração salva em ${outDir}/exploracao.json`);
    return { links, paginas, sugestao };
  }

  private async coletarLinks(): Promise<LinkApp[]> {
    const raw = await this.page!.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        texto: (a.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: (a as HTMLAnchorElement).getAttribute("href") ?? "",
      })),
    );
    const seen = new Set<string>();
    const links: LinkApp[] = [];
    for (const l of raw) {
      const key = `${l.texto}|${l.href}`;
      if (!l.href || l.href.startsWith("javascript:") || seen.has(key)) continue;
      seen.add(key);
      links.push({ ...l, candidato: RX_CANDIDATO.test(`${l.texto} ${l.href}`) });
    }
    return links;
  }

  private absolutizar(href: string): string | null {
    try {
      return new URL(href, this.page!.url()).toString();
    } catch {
      return null;
    }
  }

  private async inspecionarPagina(url: string, outDir: string, idx: number): Promise<PaginaApp | null> {
    try {
      await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await this.page!.waitForTimeout(1_500); // deixa tabelas renderizarem
    } catch {
      console.error(`[bmp] aviso: falha ao abrir ${url}`);
      return null;
    }

    const titulo = await this.page!.title().catch(() => "");
    const screenshot = join(outDir, `pagina-${idx}.png`);
    const html = join(outDir, `pagina-${idx}.html`);
    await this.page!.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    await this.page!.content().then((c) => writeFileSync(html, c)).catch(() => {});

    const tabelas = await this.page!.evaluate(() => {
      const txt = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      const out: { headers: string[]; amostra: string[][]; linhas: number }[] = [];
      const nodes = document.querySelectorAll('table, [role="table"], [role="grid"]');
      nodes.forEach((tbl) => {
        const headEls = tbl.querySelectorAll('thead th, thead td, [role="columnheader"]');
        let headers = Array.from(headEls).map((h) => txt(h)).filter(Boolean);
        const rows = Array.from(tbl.querySelectorAll('tbody tr, [role="row"]'));
        if (headers.length === 0 && rows[0]) {
          headers = Array.from(rows[0].querySelectorAll('th, td, [role="cell"]')).map((c) => txt(c));
        }
        const dataRows = rows.filter((r) => r.querySelector('td, [role="cell"]'));
        const amostra = dataRows.slice(0, 3).map((r) =>
          Array.from(r.querySelectorAll('td, [role="cell"]')).map((c) => txt(c)),
        );
        if (headers.length || amostra.length) {
          out.push({ headers, amostra, linhas: dataRows.length });
        }
      });
      return out;
    });

    console.error(`[bmp] ${url} → ${tabelas.length} tabela(s)`);
    return { url, titulo, tabelas, screenshot, html };
  }

  private derivarSugestao(paginas: PaginaApp[]): ResultadoExploracao["sugestao"] {
    const acha = (headers: string[], rx: RegExp) =>
      headers.findIndex((h) => rx.test(h));

    let melhor: { url: string; headers: string[]; colunas: Partial<BmpConfig["colunas"]>; score: number } | null = null;

    for (const p of paginas) {
      for (const t of p.tabelas) {
        const colunas: Partial<BmpConfig["colunas"]> = {};
        const data = acha(t.headers, /data|dia/i);
        const descricao = acha(t.headers, /descri|hist[oó]|lan[çc]amento|movimenta/i);
        const documento = acha(t.headers, /doc|refer|identific|n[º°o]\b/i);
        const valor = acha(t.headers, /valor|montante|cr[eé]dito|d[eé]bito/i);
        const saldo = acha(t.headers, /saldo/i);
        if (data >= 0) colunas.data = data;
        if (descricao >= 0) colunas.descricao = descricao;
        if (documento >= 0) colunas.documento = documento;
        if (valor >= 0) colunas.valor = valor;
        if (saldo >= 0) colunas.saldo = saldo;

        // Score: precisa ter data e valor para parecer um extrato.
        const score = (data >= 0 ? 2 : 0) + (valor >= 0 ? 2 : 0) + (saldo >= 0 ? 1 : 0) + (descricao >= 0 ? 1 : 0);
        if (score >= 4 && (!melhor || score > melhor.score)) {
          melhor = { url: p.url, headers: t.headers, colunas, score };
        }
      }
    }

    return melhor ? { extratoUrl: melhor.url, colunas: melhor.colunas, headers: melhor.headers } : undefined;
  }

  async disconnect(): Promise<void> {
    // Em CDP, close() apenas DESCONECTA do Chrome do usuário (não fecha a janela);
    // no modo launch, encerra o Chromium próprio.
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
