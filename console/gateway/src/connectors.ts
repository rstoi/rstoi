// Registro de conectores (MCP / sistemas internos) exposto ao console.
// `ready` = já existe/operacional no projeto; `pending` = requer credencial/URL
// (ver IMPLEMENTACAO.md → Pendências). A saúde real pode ser sondada depois.
export interface Connector {
  id: string;
  label: string;
  kind: "mcp" | "internal" | "agentic";
  transport: string;
  status: "ready" | "pending";
  note?: string;
}

export const CONNECTORS: Connector[] = [
  { id: "whatsapp", label: "WhatsApp", kind: "mcp", transport: "stdio (Playwright/Cloud API)", status: "ready", note: "src/index.ts no repo" },
  { id: "computer-use", label: "computer-use", kind: "mcp", transport: "stdio", status: "ready", note: "src/computer-use no repo" },
  { id: "gmail", label: "Gmail", kind: "mcp", transport: "Google Workspace", status: "ready" },
  { id: "calendar", label: "Calendar", kind: "mcp", transport: "Google Workspace", status: "ready" },
  { id: "drive", label: "Drive", kind: "mcp", transport: "Google Workspace", status: "ready" },
  { id: "github", label: "GitHub", kind: "mcp", transport: "GitHub MCP", status: "ready" },
  { id: "projetos", label: "Projetos", kind: "internal", transport: "HTTP", status: "pending", note: "definir URL/credencial do sistema interno" },
  { id: "contratos", label: "Contratos", kind: "internal", transport: "HTTP", status: "pending", note: "definir URL/credencial do sistema interno" },
  { id: "comercial", label: "Comercial", kind: "internal", transport: "HTTP", status: "pending", note: "definir URL/credencial do sistema interno" },
  { id: "agentes", label: "Agentes", kind: "agentic", transport: "Claude Code", status: "ready" },
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function summarize(list: Connector[] = CONNECTORS): {
  total: number;
  ready: number;
  pending: number;
} {
  return {
    total: list.length,
    ready: list.filter((c) => c.status === "ready").length,
    pending: list.filter((c) => c.status === "pending").length,
  };
}
