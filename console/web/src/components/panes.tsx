"use client";
// Painéis simples: Dashboard (KPIs) e Service (placeholder de embed MCP).
import type { ModuleDef } from "@/lib/modules";

export function DashboardPane() {
  const kpis = [
    { v: "7/7", l: "MCP servers saudáveis" },
    { v: "4", l: "Agentes ativos" },
    { v: "2", l: "Aprovações pendentes" },
    { v: "R$ 1.5k", l: "Custo do mês (est.)" },
    { v: "98%", l: "Ações auditadas" },
    { v: "12", l: "Tarefas hoje" },
  ];
  return (
    <div>
      <div className="grid-kpi">
        {kpis.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="v">{k.v}</div>
            <div className="l">{k.l}</div>
          </div>
        ))}
      </div>
      <div className="placeholder">
        <span className="badge">evolui status-dashboard.html</span>
        <p>
          Painel de saúde dos conectores, atividade do harness loop e custo
          (embed do Looker Studio). Atalhos para abrir Terminal, Claude CLI e os
          serviços em novas abas.
        </p>
      </div>
    </div>
  );
}

export function ServicePane({ module }: { module: ModuleDef }) {
  return (
    <div className="placeholder">
      <h2>{module.label}</h2>
      <p>
        <span className="badge">{module.source}</span>
      </p>
      <p>
        Janela do serviço <strong>{module.label}</strong>. As ações (ler, enviar,
        agendar, atualizar) são executadas pelo respectivo MCP server através do
        gateway; ações externas ou irreversíveis passam pela fila de aprovação
        (human-in-the-loop) no painel da direita.
      </p>
    </div>
  );
}
