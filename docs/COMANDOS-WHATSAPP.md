# Comandos aceitos nas mensagens de WhatsApp

O agente de WhatsApp (`scripts/wa-agent.ts`, `npm run agent`) interpreta **um único
comando** dentro das mensagens: o prefixo **`/setup`** seguido de um pedido em
linguagem natural. Tudo que não começa com `/setup` é ignorado.

## Sintaxe

```
/setup <pedido em linguagem natural>
```

O texto após `/setup` é interpretado pelo modelo (Claude `claude-opus-4-8`), que
executa as ações necessárias no projeto (ler arquivos, rodar `npm`, `git`, etc.) e
responde com o resultado. Não há um catálogo fixo de subcomandos — é linguagem
natural.

| Mensagem | O que acontece |
|---|---|
| `/setup status do projeto` | resumo do estado do projeto |
| `/setup rode os testes` | executa a suíte e relata |
| `/setup como está o git` | status/log do repositório |
| `/setup faça o build e diga se passou` | roda o build e responde |
| `/setup` (sozinho) | assume "status do projeto" |
| `/setup ajuda` (ou `help`, `?`, `comandos`) | mostra a ajuda, sem executar nada |

A resposta vem como `⏳ Executando…` e depois `✅ <resultado>` (ou `❌ Erro: …`),
truncada em ~3800 caracteres.

## Onde funciona e quem pode usar (autorização)

`/setup` executa comandos de shell no host, então o acesso é controlado
(**deny por padrão**):

- **`WA_AGENT_GROUPS`** — grupos onde o agente aceita `/setup`. Atual:
  `financeiro setup, projetos setup`. A participação nesses grupos controlados é a
  fronteira de confiança (membros conhecidos).
- **`WA_AGENT_ALLOWED_SENDERS`** — (opcional) restringe ainda mais por número,
  mesmo dentro dos grupos. Vazio = qualquer membro dos grupos autorizados.
- Se **nada** estiver configurado, **ninguém** é autorizado (nunca execução aberta
  a terceiros).
- O grupo **`financasfacil`** está em `WA_BLOCKED_GROUPS` e é **ignorado por
  completo** (não monitorado nem respondido) — é um grupo distinto de
  "financeiro setup".

Filtros adicionais: o agente ignora mensagens anteriores ao seu start e as
próprias mensagens; só age com o prefixo `/setup`.

## Resumo

| Item | Valor |
|---|---|
| Prefixo | `/setup` |
| Forma | `/setup <texto livre>` |
| Ajuda | `/setup ajuda` |
| Grupos | `financeiro setup`, `projetos setup` |
| Autorização | membro de grupo autorizado (deny por padrão) |
| Bloqueado | `financasfacil` |
