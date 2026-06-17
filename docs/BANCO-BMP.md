# Agente Banco BMP (AntecipaFácil)

Agente que acessa a **conta corrente BMP** pelo webapp **AntecipaFácil**,
extrai as **movimentações** do extrato e as **registra** localmente (SQLite),
de forma **idempotente** (não duplica lançamentos), com **sincronização diária
automática às 01:00** (horário de Brasília).

## Arquitetura

```
src/bmp/
├── types.ts       # Movimentacao, LinhaExtrato, SyncResult
├── parse.ts       # normalização pura (valor/data BR, tipo, hash de dedup) — testável
├── config.ts      # configuração via env (URL, credenciais, seletores, horário)
├── store.ts       # SQLite: bmp_movimentacoes + bmp_sync_log, dedup por id
├── scraper.ts     # Playwright/Chromium: login + extração do extrato
├── agent.ts       # orquestra: extrair → normalizar → registrar → log
└── scheduler.ts   # msUntilNextRun (pura) + agendador diário

scripts/
├── bmp-sync.ts    # npm run bmp:sync   — sincroniza agora e sai
└── bmp-daemon.ts  # npm run bmp:daemon — mantém vivo e sincroniza às 01:00
```

A deduplicação usa um `id` = hash estável de `conta | data | descrição | valor |
documento`. Rodar a sincronização várias vezes no mesmo dia só adiciona
movimentações realmente novas.

## Uso

```bash
# Sincronização única (ideal para gatilho agendado da plataforma):
npm run bmp:sync

# Daemon: mantém o processo vivo e sincroniza diariamente no horário configurado:
npm run bmp:daemon

# Explorar o app logado e LOCALIZAR a tabela de transações do BMP (1ª vez):
npm run bmp:explore
```

## Localizar as transações do BMP (`bmp:explore`)

Antes de calibrar os seletores, use o explorador: ele percorre o app **logado**
(somente leitura), lista os links de menu, visita os candidatos
(extrato/conta/saldo/movimentações), inspeciona as tabelas e **sugere**
`BMP_AF_EXTRATO_URL` + os índices `BMP_COL_*`. Salva screenshots, HTML e
`exploracao.json` em `data/bmp-explore/`.

```bash
# com janela visível (loga na hora, se ainda não houver sessão salva):
BMP_HEADLESS=false npm run bmp:explore
```

Requer, neste ambiente: egress liberado para `dash.antecipafacil.net.br` e uma
sessão OAuth ativa. Não executa nenhuma operação bancária — apenas navega e lê.

## Configuração

Defina no **environment do Claude Code na web** (segredos **não** vão para o
repositório). Referência completa em `.env.example`:

| Variável | Função | Padrão |
|---|---|---|
| `BMP_AUTH_MODE` | `session` (OAuth Google/Microsoft) ou `password` (legado) | `session` |
| `BMP_AF_USER` / `BMP_AF_PASSWORD` | Credenciais (apenas modo `password`, **segredo**) | — |
| `BMP_LOGIN_WAIT_MS` | Espera pelo login interativo (`BMP_HEADLESS=false`) | `300000` |
| `BMP_AF_URL` | URL do painel | `https://dash.antecipafacil.net.br` |
| `BMP_AF_EXTRATO_URL` | URL direta do extrato da conta BMP (opcional) | — |
| `BMP_CONTA` | Rótulo gravado em cada movimentação | `BMP conta corrente` |
| `BMP_DB_PATH` | Arquivo SQLite | `./data/bmp.db` |
| `BMP_SESSION_DIR` | Sessão do navegador (cookies/localStorage) | `./data/bmp-session` |
| `BMP_HEADLESS` | `false` para ver o navegador | `true` |
| `BMP_RUN_HOUR` / `BMP_RUN_MINUTE` | Horário da sincronização diária | `1` / `0` |
| `BMP_TIMEZONE` | Fuso do agendamento | `America/Sao_Paulo` |
| `BMP_SEL_*` | Seletores CSS (login e tabela) | heurísticas |
| `BMP_COL_*` | Índices das colunas no extrato | `0..4` |

### Ajuste fino dos seletores ⚠️

Os seletores e índices de coluna padrão são **heurísticas** — a UI real do
AntecipaFácil precisa ser **inspecionada** e os valores ajustados via
`BMP_SEL_*` / `BMP_COL_*`. Abra a página de extrato no navegador, identifique:

1. um elemento que só existe **após o login** (`BMP_SEL_LOGGED_IN`);
2. as **linhas** da tabela de extrato (`BMP_SEL_ROW`) e suas **células**
   (`BMP_SEL_CELL`);
3. a ordem das colunas (`BMP_COL_DATA`, `BMP_COL_DESCRICAO`, `BMP_COL_DOCUMENTO`,
   `BMP_COL_VALOR`, `BMP_COL_SALDO`);
4. apenas no modo `password`: campos de usuário/senha e botão
   (`BMP_SEL_USER`, `BMP_SEL_PASSWORD`, `BMP_SEL_SUBMIT`).

Para depurar com a janela visível: `BMP_HEADLESS=false npm run bmp:sync`.

## Autenticação (OAuth Google/Microsoft)

O painel `dash.antecipafacil.net.br` autentica via **OAuth** (Google/Microsoft),
não por usuário/senha. Não há como automatizar esse fluxo apenas com o e-mail —
ele exige senha + 2FA + consentimento. Por isso o **modo padrão é `session`**:

1. Faça o **login interativo uma vez** com a janela visível:
   ```bash
   BMP_HEADLESS=false npm run bmp:sync
   ```
   Conclua o login Google/Microsoft na janela; a sessão é gravada em
   `BMP_SESSION_DIR` (`./data/bmp-session`).
2. As execuções seguintes **reaproveitam a sessão** — sem relogar, até expirar.

O modo `password` (`BMP_AUTH_MODE=password` + `BMP_AF_USER/PASSWORD`) existe como
legado, caso haja um login por formulário.

## Pré-requisitos do ambiente

- **Egress de rede**: a política do environment precisa **liberar os hosts** do
  AntecipaFácil — `dash.antecipafacil.net.br` e `antecipafacil.net.br` — além
  dos domínios de login (`accounts.google.com`, `*.googleusercontent.com`). Por
  padrão o ambiente libera essencialmente `github.com` + registries; sem isso o
  acesso retorna `403 host_not_allowed`. Ver `docs/RESILIENCIA.md`.
- **Chromium**: instalado pelo `SessionStart` hook / imagem base
  (`/opt/pw-browsers`), igual ao adaptador Playwright do WhatsApp.
- **Sessão OAuth e ambiente efêmero**: `data/bmp-session` **não sobrevive a
  reboots**. Para autonomia diária real, persista essa pasta externamente — do
  contrário o login interativo precisa ser refeito a cada container novo.

## Sincronização diária às 01:00 — resiliência

O container do Claude Code na web é **efêmero**: processos não sobrevivem a
reboots (ver `docs/RESILIENCIA.md`). Há duas formas de garantir a execução
diária:

1. **Gatilho agendado da plataforma (recomendado)** — configure um trigger que
   rode `npm run bmp:sync` às 01:00. Resiliente a reboots, pois cada execução é
   um processo novo e curto.
2. **Daemon** (`npm run bmp:daemon`) — agenda internamente para 01:00
   (`America/Sao_Paulo`) e reagenda a cada execução. Só roda enquanto o processo
   estiver vivo; após um reboot, precisa ser reiniciado.

O cálculo do próximo horário é a função pura `msUntilNextRun`, coberta por
testes (`tests/bmp/scheduler.test.ts`).

## O que persiste / o que não persiste

- **Código e configuração** (`src/bmp`, scripts, `.env.example`): no Git →
  resiliente.
- **Segredos** (`BMP_AF_USER/PASSWORD`): no environment, nunca no repo.
- **Histórico** (`data/bmp.db`) e **sessão do navegador** (`data/bmp-session`):
  ignorados pelo Git e **não** sobrevivem a reboots a menos que persistidos
  externamente.

## Testes

```bash
npx vitest run tests/bmp     # parse, store (dedup) e scheduler
npm run typecheck
```
