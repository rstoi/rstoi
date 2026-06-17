/**
 * Teste E2E da NAVEGAÇÃO (abordagem do blueprint), com browser real:
 *   connectOverCDP (anexa a navegador já aberto) → seleciona aba autenticada →
 *   Conta consignada → Buscar → PAGINAÇÃO → extrai linhas → consolida.
 *
 * Exercita o caminho de produção (`AntecipaFacilScraper` em modo `cdp` +
 * `scrapeContaConsignada`) contra um fixture HTTP local que simula o
 * `/escrow-account` com duas páginas.
 *
 * Requer um Chromium executável. Gated por BMP_E2E=1 para não pesar no
 * `npm test` padrão. Rode: BMP_E2E=1 npx vitest run tests/bmp/navegacao.e2e.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import { createServer as netServer } from "net";
import { readdirSync, existsSync } from "fs";
import { chromium, type Browser } from "playwright";
import { loadBmpConfig } from "../../src/bmp/config.js";
import { AntecipaFacilScraper } from "../../src/bmp/scraper.js";
import { linhaToMovimentacao } from "../../src/bmp/parse.js";
import { consolidarExtrato } from "../../src/bmp/consolida.js";

const PAGINA_ESCROW = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <nav>logado</nav>
  <input id="ini" type="date"><input id="fim" type="date">
  <button id="buscar">Buscar</button>
  <table><tbody id="tb">
    <tr><td>17/06/2026</td><td>PIX recebido Cliente A</td><td>E1</td><td>2.500,00</td><td>12.500,00</td></tr>
    <tr><td>17/06/2026</td><td>Tarifa TED</td><td></td><td>-9,90</td><td>12.490,10</td></tr>
  </tbody></table>
  <button id="prox">Próxima</button>
  <script>
    document.getElementById('prox').addEventListener('click', function () {
      document.getElementById('tb').innerHTML =
        '<tr><td>18/06/2026</td><td>Antecipacao NF 9981</td><td>A9</td><td>8.000,00</td><td>20.490,10</td></tr>' +
        '<tr><td>18/06/2026</td><td>Pagamento XPTO</td><td>B7</td><td>-1.250,00</td><td>19.240,10</td></tr>';
      this.disabled = true;
    });
  </script>
</body></html>`;

/** Localiza um Chromium completo (não o headless-shell, que pode faltar). */
function acharChromium(): string | undefined {
  if (process.env.BMP_CHROMIUM_PATH && existsSync(process.env.BMP_CHROMIUM_PATH)) {
    return process.env.BMP_CHROMIUM_PATH;
  }
  const base = "/opt/pw-browsers";
  if (existsSync(base)) {
    for (const dir of readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      const p = `${base}/${dir}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = netServer();
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
    s.on("error", rej);
  });
}

describe.skipIf(!process.env.BMP_E2E)("navegação BMP (CDP + Conta consignada)", () => {
  let server: Server;
  let browser: Browser;
  let baseUrl = "";

  beforeAll(async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = createServer((req, resp) => {
      if ((req.url ?? "/").startsWith("/escrow-account")) {
        resp.setHeader("content-type", "text/html"); resp.end(PAGINA_ESCROW);
      } else {
        resp.setHeader("content-type", "text/html"); resp.end("<nav>logado</nav><h1>dash</h1>");
      }
    });
    await new Promise<void>((r) => server.listen(port, r));

    const cdpPort = await freePort();
    browser = await chromium.launch({
      headless: true,
      executablePath: acharChromium(),
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--single-process", "--no-zygote", "--disable-gpu",
        `--remote-debugging-port=${cdpPort}`,
      ],
    });
    // "Aba autenticada" que vive no navegador do usuário:
    const seed = await browser.newPage();
    await seed.goto(`${baseUrl}/`);

    Object.assign(process.env, {
      BMP_CONNECT_MODE: "cdp",
      BMP_CDP_URL: `http://127.0.0.1:${cdpPort}`,
      BMP_AF_URL: `${baseUrl}/`,
      BMP_ESCROW_URL: `${baseUrl}/escrow-account`,
      BMP_EXTRATO_FONTE: "escrow",
      BMP_SEL_LOGGED_IN: "nav",
      BMP_SEL_ROW: "table tbody tr",
      BMP_SEL_CELL: "td",
      BMP_SEL_BUSCAR: "#buscar",
      BMP_SEL_PROXIMA: "#prox",
      BMP_COL_DATA: "0", BMP_COL_DESCRICAO: "1", BMP_COL_DOCUMENTO: "2", BMP_COL_VALOR: "3", BMP_COL_SALDO: "4",
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close().catch(() => {});
    await new Promise<void>((r) => server?.close(() => r()));
  });

  it("anexa via CDP, navega a Conta consignada e pagina o extrato", async () => {
    const scraper = new AntecipaFacilScraper(loadBmpConfig());
    await scraper.connect();
    const linhas = await scraper.scrapeContaConsignada();
    await scraper.disconnect();

    // 2 páginas × 2 linhas = 4 (paginação relocalizou o "próxima").
    expect(linhas).toHaveLength(4);

    const movs = linhas.map((l) => linhaToMovimentacao(l, "BMP conta consignada", 1));
    const c = consolidarExtrato(movs);
    expect(c.totalEntradas).toBe(10500);
    expect(c.totalSaidas).toBe(1259.9);
    expect(c.saldoLiquido).toBe(9240.1);
    expect(c.saldoFinal).toBe(19240.1);
  }, 60_000);
});
