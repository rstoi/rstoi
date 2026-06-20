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

### Próximo — Passo 3: build do frontend (`next build`, export estático).

## Pendências registradas
- _(nenhuma até aqui)_ — instalações e builds nativos funcionaram sem necessidade
  de interação.
