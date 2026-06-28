/**
 * Registry central de todos os componentes da infraestrutura.
 *
 * Toda adição de agente/serviço/interface começa aqui.
 */

export type ComponentType = "mcp-server" | "agent" | "web-server" | "worker";
export type ComponentStatus = "running" | "stopped" | "error" | "unknown";

export interface ServiceDef {
  id: string;
  name: string;
  type: ComponentType;
  description: string;
  cmd: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  /** Grupos/triggers para agentes */
  triggers?: string[];
  /** Porta exposta (para servidores web) */
  port?: number;
  /** URL de health check */
  healthUrl?: string;
  /** Quem depende deste serviço */
  dependsOn?: string[];
}

export interface RepoDef {
  id: string;
  name: string;
  remote: string;
  branch: string;
  local: string;
}

export interface InterfaceDef {
  id: string;
  name: string;
  kind: "cli" | "web" | "app" | "whatsapp";
  description: string;
  url?: string;
  commands?: Record<string, string>;
}

const PROJECT = process.env.CLAUDE_PROJECT_DIR ?? "/home/user/rstoi";
const NODE = "/opt/node22/bin/node";
const TSX = `${PROJECT}/node_modules/.bin/tsx`;
const PATH_ENV = "/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

// ── Serviços / Servidores ──────────────────────────────────────────────────

export const SERVICES: ServiceDef[] = [
  {
    id: "whatsapp-mcp",
    name: "WhatsApp MCP",
    type: "mcp-server",
    description: "MCP server de WhatsApp via Baileys (protocolo nativo, sem browser)",
    cmd: TSX,
    args: ["src/index.ts"],
    cwd: PROJECT,
    env: {
      PATH: PATH_ENV,
      HOME: "/root",
      WA_ADAPTER: "baileys",
      WA_SESSION_DIR: `${PROJECT}/data/wa-session`,
      WA_QR_PATH: `${PROJECT}/data/qr.png`,
      WA_BLOCKED_GROUPS: process.env.WA_BLOCKED_GROUPS ?? "financasfacil",
      SQLITE_DB_PATH: `${PROJECT}/data/whatsapp-personal.db`,
      MCP_TRANSPORT: "stdio",
      LOG_LEVEL: "info",
    },
    dependsOn: [],
  },
  {
    id: "computer-use",
    name: "Computer-use MCP",
    type: "mcp-server",
    description: "MCP server de automação de desktop (screenshot, click, type)",
    cmd: TSX,
    args: ["src/computer-use/server.ts"],
    cwd: PROJECT,
    env: {
      PATH: PATH_ENV,
      HOME: "/root",
      DISPLAY: ":99",
    },
    dependsOn: [],
  },
  {
    id: "status-server",
    name: "Status Dashboard",
    type: "web-server",
    description: "Painel web de status ao vivo e API de gestão",
    cmd: NODE,
    args: ["status-server.js"],
    cwd: PROJECT,
    port: 4099,
    healthUrl: "http://localhost:4099/api/status",
    env: { PATH: PATH_ENV, HOME: "/root", STATUS_PORT: "4099" },
    dependsOn: [],
  },
];

// ── Agentes ───────────────────────────────────────────────────────────────

export const AGENTS: ServiceDef[] = [
  {
    id: "agent-setup",
    name: "Agente /setup",
    type: "agent",
    description: "Interpreta comandos /setup no WhatsApp e executa via Claude + bash",
    cmd: TSX,
    args: ["scripts/wa-agent.ts"],
    cwd: PROJECT,
    env: {
      PATH: PATH_ENV,
      HOME: "/root",
      WA_ADAPTER: "baileys",
      WA_SESSION_DIR: `${PROJECT}/data/wa-session`,
      WA_BLOCKED_GROUPS: process.env.WA_BLOCKED_GROUPS ?? "financasfacil",
      SQLITE_DB_PATH: `${PROJECT}/data/whatsapp-personal.db`,
      CLAUDE_MODEL: "claude-opus-4-8",
      WA_AGENT_GROUPS: process.env.WA_AGENT_GROUPS ?? "",
      WA_AGENT_ALLOWED_SENDERS: process.env.WA_AGENT_ALLOWED_SENDERS ?? "",
    },
    triggers: ["/setup"],
    dependsOn: [],
  },
  // Futuros agentes (placeholder):
  // { id: "agent-executive", name: "Assistente Executivo", ... },
  // { id: "agent-sdr",       name: "Agente SDR/Atendimento", ... },
  // { id: "agent-devops",    name: "Agente DevOps", ... },
];

// ── Repositórios ──────────────────────────────────────────────────────────

export const REPOS: RepoDef[] = [
  {
    id: "rstoi",
    name: "rstoi/rstoi",
    remote: "https://github.com/rstoi/rstoi",
    branch: "claude/trusting-archimedes-crjglq",
    local: PROJECT,
  },
];

// ── Interfaces ────────────────────────────────────────────────────────────

export const INTERFACES: InterfaceDef[] = [
  {
    id: "cli",
    name: "CLI (npm run)",
    kind: "cli",
    description: "Comandos npm para controle direto dos serviços",
    commands: {
      "ctl":           "Gestão central (status/start/stop/logs)",
      "connect":       "Autenticar WhatsApp (gera QR)",
      "dev":           "Inicia MCP WhatsApp em modo dev",
      "agent":         "Inicia agente /setup",
      "mcp:smoke":     "Smoke test do MCP de WhatsApp",
      "test":          "Roda a suíte de testes",
      "typecheck":     "Verificação de tipos TypeScript",
    },
  },
  {
    id: "web-dashboard",
    name: "Web Dashboard",
    kind: "web",
    description: "Painel de status ao vivo com controle de serviços",
    url: "http://localhost:4099",
  },
  {
    id: "whatsapp-personal",
    name: "WhatsApp Pessoal",
    kind: "whatsapp",
    description: "Canal de interação com o assistente via número pessoal (Baileys)",
  },
  {
    id: "claude-code-web",
    name: "Claude Code Web",
    kind: "app",
    description: "Sessão de desenvolvimento no Claude Code na web (este ambiente)",
    url: "https://claude.ai/code",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

export const ALL_SERVICES = [...SERVICES, ...AGENTS];

export function findService(id: string): ServiceDef | undefined {
  return ALL_SERVICES.find(s => s.id === id);
}
