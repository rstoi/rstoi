import Link from "next/link";

const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Diagnóstico",
    items: [
      { href: "", label: "Dashboard" },
      { href: "/base-financeira", label: "Base Financeira" },
      { href: "/dre", label: "DRE Gerencial" },
      { href: "/situacao-financeira", label: "Situação Financeira" },
      { href: "/forecast", label: "Forecast" },
    ],
  },
  {
    label: "Decisão",
    items: [
      { href: "/recomendacoes", label: "Recomendações" },
      { href: "/decisoes", label: "Decisões" },
      { href: "/backtesting", label: "Backtesting" },
      { href: "/pdca", label: "PDCA e Melhoria" },
    ],
  },
  {
    label: "Governança e Pessoas",
    items: [
      { href: "/governanca", label: "Governança e Diretoria" },
      { href: "/desenvolvimento-organizacional", label: "Desenvolvimento Organizacional" },
      { href: "/pessoas", label: "Pessoas e Perfil Humano" },
    ],
  },
  {
    label: "Base e Operação",
    items: [
      { href: "/fontes", label: "Fontes de Dados" },
      { href: "/arquivos", label: "Arquivos" },
      { href: "/relatorios", label: "Relatórios" },
      { href: "/auditoria", label: "Auditoria" },
      { href: "/configuracoes", label: "Configurações" },
    ],
  },
];

export function Sidebar({ companyId }: { companyId: string }) {
  const base = `/empresas/${companyId}`;
  return (
    <nav className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 md:flex">
      <Link href="/empresas" className="text-xs font-medium text-muted hover:text-foreground">
        ← Todas as empresas
      </Link>
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={`${base}${item.href}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-foreground/90 hover:bg-baita-purple/10 hover:text-baita-purple"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
