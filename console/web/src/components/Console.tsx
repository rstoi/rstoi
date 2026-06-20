"use client";
// Console: top bar + navegação + abas + área de trabalho + painel contextual.
import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { MODULES, moduleById, type ModuleDef } from "@/lib/modules";
import { signOut } from "@/lib/firebase";
import TerminalPane from "./TerminalPane";
import { DashboardPane, ServicePane } from "./panes";

// Papéis do usuário (em produção vêm das custom claims / grupos do Workspace,
// resolvidos pelo gateway). Aqui assumimos acesso para o esqueleto.
function canSee(m: ModuleDef, roles: Set<string>): boolean {
  if (!m.sensitive) return true;
  return roles.has("operador") || roles.has("admin");
}

function Pane({ module }: { module: ModuleDef }) {
  switch (module.kind) {
    case "dashboard":
      return <DashboardPane />;
    case "terminal":
      return <TerminalPane kind="terminal" />;
    case "claude":
      return <TerminalPane kind="claude" />;
    default:
      return <ServicePane module={module} />;
  }
}

export default function Console({ user }: { user: User | null }) {
  // No esqueleto, todos os papéis liberados; troque pela resolução real (RBAC).
  const roles = useMemo(() => new Set(["operador", "admin"]), []);
  const visible = MODULES.filter((m) => canSee(m, roles));

  const [openTabs, setOpenTabs] = useState<string[]>(["painel"]);
  const [active, setActive] = useState("painel");

  function openModule(id: string) {
    setOpenTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActive(id);
  }
  function closeTab(id: string) {
    setOpenTabs((t) => {
      const next = t.filter((x) => x !== id);
      if (active === id) setActive(next[next.length - 1] ?? "");
      return next;
    });
  }

  const groups = Array.from(new Set(visible.map((m) => m.group)));

  return (
    <div className="console">
      <header className="topbar">
        <span className="brand">setupOS Cloud</span>
        <input className="search" placeholder="Buscar e-mails, arquivos, conversas, PRs…" />
        <span className="spacer" />
        <span className="user">
          {user?.email ?? "demo@setup.com.br"}
          <button onClick={() => signOut()}>sair</button>
        </span>
      </header>

      <div className="body">
        <nav className="sidebar">
          {groups.map((g) => (
            <div key={g}>
              <div className="group">{g}</div>
              {visible
                .filter((m) => m.group === g)
                .map((m) => (
                  <button
                    key={m.id}
                    className={`navitem ${active === m.id ? "active" : ""}`}
                    onClick={() => openModule(m.id)}
                  >
                    <span className="dot" />
                    {m.label}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <section className="work">
          <div className="tabs">
            {openTabs.map((id) => {
              const m = moduleById(id);
              if (!m) return null;
              return (
                <div
                  key={id}
                  className={`tab ${active === id ? "active" : ""}`}
                  onClick={() => setActive(id)}
                >
                  {m.label}
                  <span
                    className="x"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(id);
                    }}
                  >
                    ✕
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pane">
            {active && moduleById(active) ? (
              <Pane module={moduleById(active)!} />
            ) : (
              <div className="placeholder">Abra um módulo na navegação.</div>
            )}
          </div>
        </section>

        <aside className="context">
          <h3>Aprovações pendentes</h3>
          <div className="card2">
            Enviar proposta ao cliente X por e-mail
            <div className="approve">
              <button className="ok">Aprovar</button>
              <button className="no">Recusar</button>
            </div>
          </div>
          <div className="card2">
            Atualizar status no sistema de Projetos
            <div className="approve">
              <button className="ok">Aprovar</button>
              <button className="no">Recusar</button>
            </div>
          </div>
          <h3>Atividade dos agentes</h3>
          <div className="card2">Assistente Executivo · triando e-mails (12)</div>
          <div className="card2">Atendimento/SDR · 3 conversas no WhatsApp</div>
          <h3>Custo do mês</h3>
          <div className="card2">~R$ 1.550 · dentro do orçamento</div>
        </aside>
      </div>
    </div>
  );
}
