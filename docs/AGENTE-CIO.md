# Agente CIO — Resumo Executivo Diário

O Agente CIO (`scripts/wa-cio-agent.ts`, `npm run cio-report`) se comporta como
um CIO experiente, com abordagem **AI-first**: coleta os principais sinais do
projeto, pede a um modelo Claude para sintetizar um resumo executivo em
português e envia a mensagem para o grupo de WhatsApp **`Baita TI`**.

## O que ele monitora ("a situação")

Coletado por `src/cio/collect-status.ts` (`collectSituacao()`):

| Sinal | Fonte |
|---|---|
| Git | branch atual, working tree limpo/sujo, último commit |
| Testes | `npm test` (passando/falhando) |
| Recursos | RAM e disco (`free`, `df`) |
| Rede | alcance de `github.com` e `graph.facebook.com` |
| WhatsApp | adaptador ativo (`WA_ADAPTER`), volume de mensagens/contatos no SQLite |
| Pendências | derivadas dinamicamente dos itens acima (nunca hardcoded) |

Esses dados brutos viram um prompt (`src/cio/summary.ts`) com a persona de CIO
(`buildCioSystemPrompt`) e são resumidos pelo modelo em seções curtas: Saúde do
sistema, Git & entregas, Qualidade, WhatsApp, Pendências e Recomendação do CIO.

## Diferença de propósito em relação ao `/setup`

Ao contrário do `scripts/wa-agent.ts` (que executa comandos de shell
arbitrários vindos do WhatsApp), o Agente CIO **é somente leitura**: ele nunca
dá ferramenta de execução de comandos ao modelo, só passa os dados já
coletados. Isso elimina o risco de RCE em uma automação que roda sem
supervisão humana.

## Uso manual

```bash
ANTHROPIC_API_KEY=sk-ant-... WA_ADAPTER=playwright npm run cio-report
# ou, com uma variável de ambiente customizada para o grupo:
WA_CIO_GROUP="Baita TI" npm run cio-report
```

Pré-requisitos: `ANTHROPIC_API_KEY` configurada e sessão WhatsApp ativa
(`npm run connect`). Se o grupo configurado em `WA_CIO_GROUP` não existir (ou
estiver em `WA_BLOCKED_GROUPS`), o script termina com erro e **não envia**
nada.

## Agendamento diário às 8:00

O container deste projeto é **efêmero** (ver `docs/RESILIENCIA.md`): não deve
manter um processo Node em loop esperando o horário certo, pois ele não
sobrevive a reboot/reciclagem. O agendamento diário é responsabilidade de algo
**externo ao processo do agente**, chamando `npm run cio-report` uma vez por
dia às 8:00:

- **Recomendado**: um *trigger* agendado da plataforma Claude Code (fora do
  repositório), configurado para rodar `npm run cio-report` neste projeto
  todo dia às 8:00.
- **Alternativa** (host próprio/persistente): `crontab` do sistema, ex.:
  `0 8 * * * cd /caminho/do/projeto && npm run cio-report >> /var/log/cio-agent.log 2>&1`

Segredos (`ANTHROPIC_API_KEY`, credenciais do WhatsApp) devem vir do ambiente
de execução do agendador, nunca commitados no repositório.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `WA_CIO_GROUP` | `Baita TI` | Nome do grupo de WhatsApp que recebe o resumo |
| `ANTHROPIC_API_KEY` | — | Necessária para gerar o resumo |
| `CLAUDE_MODEL` | `claude-opus-4-8` | Modelo usado para sintetizar o resumo |
