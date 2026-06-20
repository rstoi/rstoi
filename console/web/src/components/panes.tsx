"use client";
// Painéis simples: Dashboard (KPIs + saúde de conectores) e Service.
import { useEffect, useState } from "react";
import type { ModuleDef } from "@/lib/modules";
import { fetchConnectors, type ConnectorsResponse } from "@/lib/gateway";

export function DashboardPane() {
  const [data, setData] = useState<ConnectorsResponse | null>(null);

  useEffect(() => {
    let on = true;
    fetchConnectors().then((d) => on && setData(d));
    return () => {
      on = false;
    };
  }, []);

  const health = data
    ? `${data.summary.ready}/${data.summary.total}`
    : "—";

  const kpis = [
    { v: health, l: "Conectores prontos" },
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
        {data ? (
          <>
            <p>Saúde dos conectores (via gateway):</p>
            <ul>
              {data.connectors.map((c) => (
                <li key={c.id}>
                  <strong>{c.label}</strong> — {c.status}
                  {c.note ? ` (${c.note})` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            Conectado ao gateway, este painel mostra a saúde real dos conectores,
            a atividade do harness loop e o custo (embed do Looker Studio). Sem
            sessão/gateway, opera em modo demonstração.
          </p>
        )}
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
