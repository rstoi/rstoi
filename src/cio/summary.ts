import type { Situacao } from "./collect-status.js";

/**
 * Persona do Agente CIO: um CIO experiente, com abordagem AI-first, que
 * traduz sinais técnicos brutos em um resumo executivo acionável.
 */
export function buildCioSystemPrompt(): string {
  return [
    "Você é o CIO (Chief Information Officer) do time Baita TI, com abordagem AI-first:",
    "prioriza automação, mede antes de opinar e é direto sobre riscos.",
    "",
    "Escreva em português do Brasil, tom executivo — direto, sem jargão técnico desnecessário.",
    "Formate para WhatsApp: *negrito* com asteriscos simples, bullets com \"•\", no máximo 1 emoji por seção,",
    "sem blocos de código nem markdown de tabela.",
    "",
    "Estruture em seções curtas, nesta ordem:",
    "🩺 *Saúde do sistema* — recursos e rede",
    "🔀 *Git & entregas* — branch, working tree, último commit",
    "✅ *Qualidade* — testes passando/falhando",
    "💬 *WhatsApp* — adaptador ativo e volume de dados",
    "⚠️ *Pendências* — riscos e bloqueios reais (não invente nada que não esteja nos dados)",
    "🎯 *Recomendação do CIO* — 1 a 2 ações objetivas, priorizando automação/IA quando fizer sentido",
    "",
    "Seja honesto: se está tudo bem, diga em poucas palavras e não infle o texto.",
    "Baseie-se estritamente nos dados fornecidos — nunca invente números ou fatos.",
    "Limite total: ~1200 caracteres.",
  ].join("\n");
}

/** Serializa a situação coletada em um prompt de usuário para o modelo resumir. */
export function buildCioUserPrompt(s: Situacao): string {
  const lines = [
    `Data/hora da coleta: ${s.ts}`,
    `Git: branch "${s.git.branch}", working tree ${s.git.clean ? "limpo" : "com mudanças pendentes"}, último commit: "${s.git.lastCommit}" (${s.git.lastCommitTime})`,
    `Testes: ${s.testes.pass} passando, ${s.testes.fail} falhando`,
    `Recursos: RAM em ${s.recursos.ramPct}%, disco em ${s.recursos.discoPct}%`,
    `Rede: ${s.rede.map((r) => `${r.host} ${r.ok ? "OK" : "falha"}`).join(", ")}`,
    `WhatsApp: adaptador "${s.whatsapp.adapter}", ${s.whatsapp.mensagens} mensagens e ${s.whatsapp.contatos} contatos no banco local`,
    `Pendências detectadas: ${s.pendencias.length ? s.pendencias.join("; ") : "nenhuma"}`,
  ];
  return `Gere o resumo executivo diário do Baita TI com base nestes dados coletados automaticamente:\n\n${lines.join("\n")}`;
}
