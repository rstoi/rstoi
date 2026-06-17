/**
 * Configuração do agente Banco BMP / AntecipaFácil — toda via variáveis de
 * ambiente (segredos no environment do Claude Code na web, nunca no repo).
 * Ver `.env.example` e `docs/BANCO-BMP.md`.
 *
 * Autenticação: o painel atual (`dash.antecipafacil.net.br`) usa login via
 * OAuth (Google/Microsoft). Por isso o modo padrão é `session`: você faz o
 * login interativo uma vez (`BMP_HEADLESS=false`) e a sessão do navegador é
 * reaproveitada nas execuções seguintes. O modo `password` (usuário/senha)
 * fica como legado opcional.
 *
 * Os SELETORES e ÍNDICES de coluna abaixo são parametrizáveis porque a UI real
 * do AntecipaFácil precisa ser inspecionada para ajuste fino.
 */

export type BmpAuthMode = "session" | "password";

export interface BmpSelectors {
  /** Candidatos para o campo de usuário/e-mail/CPF no login. */
  user: string;
  /** Candidatos para o campo de senha. */
  password: string;
  /** Candidatos para o botão de enviar/login. */
  submit: string;
  /** Presença indica que a sessão está logada (dashboard carregado). */
  loggedIn: string;
  /** Linhas da tabela de extrato/movimentações. */
  row: string;
  /** Células dentro de cada linha. */
  cell: string;
}

export interface BmpConfig {
  /** URL inicial (login) do AntecipaFácil. */
  url: string;
  /** URL direta do extrato/movimentações da conta BMP (opcional). */
  extratoUrl?: string;
  /** `session` (OAuth Google/Microsoft, padrão) ou `password` (legado). */
  authMode: BmpAuthMode;
  user: string;
  password: string;
  /** Tempo de espera (ms) pelo login interativo quando `BMP_HEADLESS=false`. */
  loginWaitMs: number;
  /** Rótulo da conta gravado em cada movimentação. */
  conta: string;

  headless: boolean;
  sessionDir: string;
  chromiumPath?: string;

  /** Mapeamento coluna → índice na linha do extrato. */
  colunas: { data: number; descricao: number; documento: number; valor: number; saldo: number };
  selectors: BmpSelectors;

  /** Agendamento diário. */
  timezone: string;
  runHour: number;
  runMinute: number;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadBmpConfig(): BmpConfig {
  return {
    url: process.env.BMP_AF_URL ?? "https://dash.antecipafacil.net.br",
    extratoUrl: process.env.BMP_AF_EXTRATO_URL || undefined,
    authMode: process.env.BMP_AUTH_MODE === "password" ? "password" : "session",
    user: process.env.BMP_AF_USER ?? "",
    password: process.env.BMP_AF_PASSWORD ?? "",
    loginWaitMs: num(process.env.BMP_LOGIN_WAIT_MS, 300_000),
    conta: process.env.BMP_CONTA ?? "BMP conta corrente",

    headless: process.env.BMP_HEADLESS !== "false",
    sessionDir: process.env.BMP_SESSION_DIR ?? "./data/bmp-session",
    chromiumPath: process.env.BMP_CHROMIUM_PATH || undefined,

    colunas: {
      data: num(process.env.BMP_COL_DATA, 0),
      descricao: num(process.env.BMP_COL_DESCRICAO, 1),
      documento: num(process.env.BMP_COL_DOCUMENTO, 2),
      valor: num(process.env.BMP_COL_VALOR, 3),
      saldo: num(process.env.BMP_COL_SALDO, 4),
    },

    selectors: {
      user:
        process.env.BMP_SEL_USER ??
        'input[name="email" i], input[name="usuario" i], input[name="login" i], input[type="email"], input#email, input#usuario',
      password:
        process.env.BMP_SEL_PASSWORD ??
        'input[type="password"], input[name="senha" i], input#senha',
      submit:
        process.env.BMP_SEL_SUBMIT ??
        'button[type="submit"], button:has-text("Entrar"), button:has-text("Acessar"), input[type="submit"]',
      loggedIn:
        process.env.BMP_SEL_LOGGED_IN ??
        '[data-testid="dashboard"], nav, a:has-text("Sair"), a:has-text("Extrato"), text=Saldo',
      row:
        process.env.BMP_SEL_ROW ??
        'table tbody tr, [role="row"], .extrato-linha, .movimentacao',
      cell:
        process.env.BMP_SEL_CELL ?? 'td, [role="cell"], .col, .celula',
    },

    timezone: process.env.BMP_TIMEZONE ?? "America/Sao_Paulo",
    runHour: num(process.env.BMP_RUN_HOUR, 1),
    runMinute: num(process.env.BMP_RUN_MINUTE, 0),
  };
}
