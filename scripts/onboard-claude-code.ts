#!/usr/bin/env tsx
/**
 * Assistente de Onboarding — Claude Code
 *
 * Run: npx tsx scripts/onboard-claude-code.ts
 *
 * Faz uma entrevista curta com o profissional e gera um CLAUDE.md
 * personalizado (perfil, conectores prioritários, regras de aprovação
 * humana e primeiros comandos de "resultado rápido"), além de imprimir
 * o mesmo guia de início no terminal.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q: string): Promise<string> {
  return new Promise(res => rl.question(q, ans => res(ans.trim())));
}

async function askChoice(q: string, options: string[]): Promise<string> {
  console.log(q);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  const raw = await ask(`Escolha [1-${options.length}] (padrão 1): `);
  const idx = parseInt(raw, 10);
  return options[Number.isInteger(idx) && idx >= 1 && idx <= options.length ? idx - 1 : 0];
}

const ROLE_CONNECTORS: Record<string, string[]> = {
  "Executivo / gestão": ["Gmail", "Calendar", "Drive"],
  "Comercial / SDR": ["WhatsApp", "Gmail", "Calendar"],
  "PMO / Projetos": ["Drive", "Gmail", "sistema interno de projetos"],
  "Contratos": ["Drive", "Gmail", "sistema interno de contratos"],
  "Financeiro": ["Drive", "Gmail", "ERP/sistema financeiro"],
  "Suporte técnico / DevOps": ["GitHub", "computer-use"],
  "Outro": ["Gmail", "Calendar", "Drive"],
};

const ROLE_QUICK_WINS: Record<string, string[]> = {
  "Executivo / gestão": [
    "Resuma meus e-mails não lidos das últimas 24h e diga quais precisam de resposta hoje.",
    "Quais reuniões tenho amanhã? Para cada uma, traga o contexto (e-mails/arquivos relacionados).",
    "Busque no Drive a última versão do relatório mensal e me dê um resumo de 5 linhas.",
  ],
  "Comercial / SDR": [
    "Liste as conversas de WhatsApp das últimas 24h que ainda não recebi resposta.",
    "Rascunhe uma resposta de follow-up para o cliente X, no mesmo tom das últimas mensagens.",
    "Busque no Drive o modelo de proposta comercial mais recente.",
  ],
  "PMO / Projetos": [
    "Liste os projetos com prazo essa semana e o status atual de cada um.",
    "Gere um rascunho de relatório de status a partir dos últimos updates registrados.",
    "Quais riscos aparecem nos comentários mais recentes dos projetos em andamento?",
  ],
  "Contratos": [
    "Quais contratos vencem nos próximos 30 dias?",
    "Busque no Drive a última minuta padrão e liste as cláusulas que costumam mudar por cliente.",
    "Resuma o histórico de negociação do contrato do cliente X a partir dos e-mails.",
  ],
  "Financeiro": [
    "Liste as notas fiscais recebidas essa semana que ainda não foram conciliadas.",
    "Resuma as despesas do mês por categoria a partir dos arquivos no Drive.",
    "Rascunhe o relatório financeiro semanal no formato do último enviado.",
  ],
  "Suporte técnico / DevOps": [
    "Liste PRs abertos há mais de 3 dias sem review no GitHub.",
    "Resuma os erros mais recentes de CI e sugira a causa provável.",
    "Rode o typecheck e os testes do projeto e me diga o que está quebrado.",
  ],
  "Outro": [
    "Resuma meus e-mails não lidos das últimas 24h.",
    "O que tenho na agenda para os próximos 2 dias?",
    "Busque no Drive os arquivos que editei essa semana.",
  ],
};

const AUTONOMY_LEVELS = [
  {
    label: "Conservador — sugere e eu aprovo cada ação antes de executar",
    rule: "Toda ação (mesmo leitura) é primeiro descrita em texto; só executa a ferramenta após confirmação explícita minha.",
  },
  {
    label: "Equilibrado — age sozinho em ações de baixo risco (leitura, rascunho); pede aprovação para ações externas/irreversíveis",
    rule: "Buscar, ler e rascunhar acontece sem perguntar. Enviar mensagem/e-mail, apagar arquivo ou mexer em contrato exige minha aprovação explícita antes de executar.",
  },
  {
    label: "Autônomo — age livremente em tarefas rotineiras já validadas; só avisa depois",
    rule: "Executa de ponta a ponta tarefas do tipo já validado comigo antes; avisa o que fez ao final. Ações novas ou fora do padrão ainda pedem aprovação.",
  },
];

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(  "║  Onboarding Claude Code — primeiros passos                ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝\n");
  console.log("Algumas perguntas rápidas para gerar seu CLAUDE.md e um guia de início.\n");

  const nome = await ask("Seu nome: ");

  const cargo = await askChoice("\nQual sua área/função principal?", Object.keys(ROLE_CONNECTORS));

  const ferramentasSugeridas = ROLE_CONNECTORS[cargo];
  console.log(`\nFerramentas sugeridas para ${cargo}: ${ferramentasSugeridas.join(", ")}`);
  const ferramentasRaw = await ask("Confirme ou ajuste (separadas por vírgula, Enter para aceitar): ");
  const ferramentas = ferramentasRaw ? ferramentasRaw.split(",").map(s => s.trim()).filter(Boolean) : ferramentasSugeridas;

  console.log("\nCite até 3 tarefas repetitivas que você quer automatizar primeiro (Enter para pular):");
  const tarefas: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const t = await ask(`  Tarefa ${i}: `);
    if (t) tarefas.push(t);
  }

  const autonomiaLabel = await askChoice(
    "\nQual nível de autonomia o agente deve ter no início?",
    AUTONOMY_LEVELS.map(a => a.label)
  );
  const autonomia = AUTONOMY_LEVELS.find(a => a.label === autonomiaLabel)!;

  const destinoRaw = await ask("\nOnde salvar o arquivo? (Enter para ./CLAUDE.md): ");
  const destino = path.resolve(destinoRaw || "./CLAUDE.md");

  const quickWins = ROLE_QUICK_WINS[cargo];

  const content = `# CLAUDE.md — ${nome}

> Gerado pelo assistente de onboarding (\`scripts/onboard-claude-code.ts\`).
> Ajuste livremente conforme o uso real evoluir — este é um ponto de
> partida, não uma regra fixa.

## Perfil

- **Nome:** ${nome}
- **Área/função:** ${cargo}
- **Ferramentas/conectores prioritários:** ${ferramentas.join(", ")}

## Tarefas que quero automatizar primeiro

${tarefas.length ? tarefas.map(t => `- ${t}`).join("\n") : "- (nenhuma registrada ainda — atualize esta seção conforme forem surgindo)"}

## Nível de autonomia

**${autonomiaLabel}**

${autonomia.rule}

> Ações externas ou irreversíveis (enviar e-mail/mensagem a terceiros, apagar
> arquivo, alterar contrato) sempre merecem atenção redobrada, independente
> do nível de autonomia acima.

## Primeiros comandos para resultado rápido

Cole um destes diretamente no Claude Code para ver valor já na primeira sessão:

${quickWins.map((q, i) => `${i + 1}. "${q}"`).join("\n")}

## Como continuar

- Depois que os comandos acima funcionarem bem, peça para o próprio Claude
  Code sugerir a próxima automação com base no que você repetiu essa semana.
- Revise este arquivo a cada poucas semanas: adicione o que aprendeu sobre
  o que funciona e remova o que não se aplica mais.
`;

  fs.writeFileSync(destino, content, "utf-8");

  console.log(`\n✓ CLAUDE.md gerado em: ${destino}\n`);
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log(  "║  Guia dos primeiros 15 minutos                             ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝\n");
  console.log(`Nível de autonomia escolhido: ${autonomiaLabel}\n`);
  console.log("Experimente, na ordem, dentro do Claude Code:\n");
  quickWins.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  console.log("\nDepois disso, abra o CLAUDE.md gerado e ajuste o que fizer sentido.\n");

  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
