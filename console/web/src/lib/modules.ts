// Catálogo de módulos do console. `sensitive` => exige grupo autorizado (RBAC),
// espelhando o guardrail WA_AGENT_GROUPS do projeto. O gateway é a autoridade
// final; aqui apenas escondemos a aba quando o usuário não tem o papel.
export type ModuleKind =
  | "dashboard"
  | "terminal"
  | "claude"
  | "service";

export interface ModuleDef {
  id: string;
  label: string;
  group: string;
  kind: ModuleKind;
  sensitive?: boolean;
  /** Para painéis de serviço: rótulo de origem (MCP). */
  source?: string;
}

export const MODULES: ModuleDef[] = [
  { id: "painel", label: "Painel", group: "Operação", kind: "dashboard" },
  { id: "terminal", label: "Terminal", group: "Operação", kind: "terminal", sensitive: true },
  { id: "claude", label: "Claude CLI", group: "Operação", kind: "claude", sensitive: true },

  { id: "whatsapp", label: "WhatsApp", group: "Serviços", kind: "service", source: "MCP whatsapp-business" },
  { id: "gmail", label: "Gmail", group: "Serviços", kind: "service", source: "MCP Google Workspace" },
  { id: "calendar", label: "Calendar", group: "Serviços", kind: "service", source: "MCP Google Workspace" },
  { id: "drive", label: "Drive", group: "Serviços", kind: "service", source: "MCP Google Workspace" },
  { id: "github", label: "GitHub", group: "Serviços", kind: "service", source: "MCP github" },

  { id: "projetos", label: "Projetos", group: "Sistemas internos", kind: "service", source: "Conector interno" },
  { id: "contratos", label: "Contratos", group: "Sistemas internos", kind: "service", source: "Conector interno" },
  { id: "comercial", label: "Comercial", group: "Sistemas internos", kind: "service", source: "Conector interno" },

  { id: "agentes", label: "Agentes", group: "Gestão", kind: "service", source: "Claude Code / Agent Engine" },
  { id: "governanca", label: "Governança", group: "Gestão", kind: "service", sensitive: true, source: "Cloud Audit Logs" },
];

export function moduleById(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

/** Papéis que liberam abas sensíveis (Terminal, Claude CLI, Governança). */
export const OPERATOR_ROLES = ["operador", "admin"];

/** Um módulo é visível se não é sensível, ou se o usuário tem papel de operador. */
export function canSee(m: ModuleDef, roles: Set<string>): boolean {
  if (!m.sensitive) return true;
  return OPERATOR_ROLES.some((r) => roles.has(r));
}

/** Lista de módulos visíveis dado o conjunto de papéis do usuário. */
export function visibleModules(roles: Set<string>): ModuleDef[] {
  return MODULES.filter((m) => canSee(m, roles));
}
