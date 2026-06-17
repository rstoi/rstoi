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
```

## Configuração

Defina no **environment do Claude Code na web** (segredos **não** vão para o
repositório). Referência completa em `.env.example`:

| Variável | Função | Padrão |
|---|---|---|
| `BMP_AF_USER` / `BMP_AF_PASSWORD` | Credenciais do AntecipaFácil (**segredo**) | — |
| `BMP_AF_URL` | URL de login | `https://app.antecipafacil.com.br/login` |
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

1. os campos de **usuário** e **senha** e o **botão** de login (`BMP_SEL_USER`,
   `BMP_SEL_PASSWORD`, `BMP_SEL_SUBMIT`);
2. um elemento que só existe **após o login** (`BMP_SEL_LOGGED_IN`);
3. as **linhas** da tabela de extrato (`BMP_SEL_ROW`) e suas **células**
   (`BMP_SEL_CELL`);
4. a ordem das colunas (`BMP_COL_DATA`, `BMP_COL_DESCRICAO`, `BMP_COL_DOCUMENTO`,
   `BMP_COL_VALOR`, `BMP_COL_SALDO`).

Para depurar com a janela visível: `BMP_HEADLESS=false npm run bmp:sync`.

## Pré-requisitos do ambiente

- **Egress de rede**: a política do environment precisa **liberar o host do
  AntecipaFácil** (ex.: `app.antecipafacil.com.br`). Por padrão o ambiente
  libera essencialmente `github.com` + registries — ver `docs/RESILIENCIA.md`.
- **Chromium**: instalado pelo `SessionStart` hook / imagem base
  (`/opt/pw-browsers`), igual ao adaptador Playwright do WhatsApp.
- **2FA/MFA**: se o AntecipaFácil exigir segundo fator, o login automático
  falha. Nesse caso, autentique uma vez com `BMP_HEADLESS=false` para gravar a
  sessão em `BMP_SESSION_DIR` (reutilizada nas execuções seguintes).

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
