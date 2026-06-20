# setupOS Cloud — registro histórico da implementação

Log vivo da implementação automática (modo /loop). Cada passo é executado,
testado e confirmado antes de avançar. Pendências que exigiriam interação são
registradas aqui com a forma de contorno adotada para prosseguir.

## Plano (passos)

1. Ambiente + dependências do **frontend** (`console/web`) — instalar e typecheck.
2. Dependências do **gateway** (`console/gateway`) — instalar e typecheck.
3. **Build** do frontend (`next build`, export estático).
4. **Build** do gateway (`tsc`).
5. **Modo demonstração** testável sem Firebase (login desabilitado) + smoke do gateway (HTTP health).
6. **Teste do WebSocket** do gateway (auth recusa sem token; pty em modo local).
7. **firebase.json** + config de Hosting; **deploy doc** do Cloud Run.
8. **Testes automatizados** (vitest) para auth (domínio setup.com.br) e modules/RBAC.
9. **Integração** dos painéis de serviço com os MCP servers existentes.
10. Revisão final, documentação e fechamento.

## Histórico

### Passo 1 — Ambiente + dependências do frontend
- Status: ✅ concluído.
- Ação: `npm install` em `console/web` (113 pacotes, 28s) e `npx tsc --noEmit`.
- Teste: typecheck retornou **EXIT=0** (sem erros de tipo).

### Passo 2 — Dependências do gateway (inclui node-pty nativo)
- Status: ✅ concluído.
- Ação: toolchain presente (python3, make, g++); `npm install` (176 pacotes, 13s);
  `npx tsc --noEmit`.
- Testes: typecheck **EXIT=0**; smoke runtime do `node-pty` deu *spawn* em
  `/bin/echo` e capturou a saída via pty (`PTY_OUTPUT: "setupos-pty-ok"`).
- Observação: avisos de `uuid` deprecado (transitivo do firebase-admin) — inócuos.

### Nota de execução — agendador indisponível
- `ScheduleWakeup`/`CronCreate` não existem neste ambiente remoto, então o /loop
  não consegue reagendar disparos. Para não interromper, a implementação segue
  **continuamente na mesma sessão**, um passo por vez, com teste e registro.

### Passo 3 — Build do frontend (`next build`, export estático)
- Status: ✅ concluído.
- Teste: `next build` compilou e gerou export estático (rota `/` 124 kB First
  Load JS); import dinâmico do xterm e CSS funcionaram no build. **EXIT=0**.

### Passo 4 — Build do gateway (`tsc`)
- Status: ✅ concluído.
- Teste: `tsc` emitiu `dist/{auth,index,pty}.js`. **EXIT=0**.

### Passo 5 — Smoke do gateway (HTTP health)
- Status: ✅ concluído.
- Teste: servidor sobe sem credenciais Firebase; `GET /healthz` e `GET /`
  retornam `{"ok":true,"service":"setupos-gateway"}`.

### Passo 6 — Auth do WebSocket (deny por padrão)
- Status: ✅ concluído.
- Teste: conexão a `/pty` com token inválido é recusada com **close code 4401**
  e mensagem `token inválido`. Confirma deny-by-default das sessões de shell.

### Próximo — Passo 7: `firebase.json` + config de Hosting; Passo 8: testes (vitest).
