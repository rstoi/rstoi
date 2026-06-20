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

### Passo 7 — Config de deploy (Firebase Hosting + Cloud Run)
- Status: ✅ concluído.
- Artefatos: `console/web/firebase.json` (Hosting → `out/`, SPA rewrite, cache de
  assets), `console/web/.firebaserc`, `console/DEPLOY.md` (passo a passo de
  Cloud Run + Hosting + restrição de domínio em camadas).

### Passo 8 — Testes automatizados (vitest)
- Status: ✅ concluído.
- Refatoração: `gateway/src/auth.ts` expõe `applyPolicy` puro (domínio+RBAC);
  `web/src/lib/modules.ts` expõe `canSee`/`visibleModules`; `Console.tsx` usa-os.
- Testes: gateway **4/4** (aceita @setup.com.br verificado, recusa outro domínio,
  recusa e-mail não verificado, bloqueia shell sem papel de operador);
  frontend **3/3** (RBAC das abas sensíveis). Typecheck e build refeitos: OK.

### Passo 9 — Integração dos painéis com os conectores
- Status: ✅ concluído (camada de contrato + saúde; dados ao vivo pendentes).
- Artefatos: `gateway/src/connectors.ts` (registro + `summarize`), endpoint
  `GET /connectors` (autenticado, CORS), `web/src/lib/gateway.ts` →
  `fetchConnectors`, `DashboardPane` exibindo a saúde real com fallback demo.
- Testes: gateway **7/7** (auth 4 + conectores 3); `/connectors` retorna **401**
  sem token válido; frontend **3/3**; typecheck e build OK.

### Passo 10 — Revisão final
- Status: ✅ concluído.
- Resultado: frontend e gateway **compilam, passam nos testes (10 no total) e
  fazem build**; deploy documentado; segurança (login só @setup.com.br + RBAC)
  testada de ponta a ponta no que independe de credencial real.

## Pendências (exigem ação humana / credenciais — registradas para prosseguir)
Estas dependem de recursos externos que não existem neste sandbox. O código já
está preparado para recebê-las sem redesenho:

1. **Projeto Firebase/GCP real** (`setupos-cloud`) + chaves no
   `console/web/.env.local` e habilitar provedor Google no Firebase Auth.
   *Contorno adotado:* modo demonstração funcional sem credenciais.
2. **Service account do gateway** (ADC) com permissão de verificar ID tokens.
   *Contorno:* caminho de recusa (deny) testado; caminho de aceite valida ao ter ADC.
3. **Deploy real** (Cloud Run + Firebase Hosting + IAP). *Contorno:* `DEPLOY.md`
   com os comandos; builds gerados localmente.
4. **Dados ao vivo dos serviços** (WhatsApp/Workspace/GitHub via MCP) e **URLs/
   credenciais dos sistemas internos** (projetos/contratos/comercial). *Contorno:*
   conectores marcados `ready`/`pending` no registro; Painel mostra a saúde;
   embeds reais entram quando os MCP servers estiverem expostos ao gateway.

## Implantação real no GCP — tentativa e bloqueio (registro)
- **Objetivo:** executar o deploy real (Cloud Run + Firebase Hosting).
- **Diagnóstico do ambiente (sandbox):** `gcloud`, `firebase` e `gh` ausentes;
  sem credenciais (`GOOGLE_APPLICATION_CREDENTIALS`/projeto vazios); **docker
  daemon indisponível**. Logo, **não é possível executar o deploy real daqui** —
  ele exige identidade GCP autenticada e um projeto com billing.
- **Forma de prosseguir (sem interromper):** automação turnkey commitada, que
  executa o deploy real em ambiente autenticado, usando `gcloud run deploy
  --source` (build no Cloud Build — dispensa docker local):
  - `console/scripts/setup-gcp.sh` — habilita APIs + Artifact Registry (idempotente).
  - `console/scripts/deploy.sh` — gateway → Cloud Run, frontend → Hosting.
  - `console/cloudbuild.yaml` — pipeline Cloud Build.
  - `.github/workflows/deploy-console.yml` — deploy via GitHub Actions (WIF).
  - Validados: `bash -n` OK; YAML sem tabs/consistente.
- **Pendência bloqueadora (decisão do usuário):** fornecer acesso GCP — escolher
  entre rodar os scripts após `gcloud auth login`, conectar o repo ao Cloud
  Build, ou configurar os secrets de WIF no GitHub. **Não dá para resolver sem
  credenciais/projeto.**

## Execução do deploy real — veredito técnico (registro)
- Decisão do usuário: "você executa, eu forneço credenciais".
- **Diagnóstico de rede do sandbox:** APIs do GCP **alcançáveis**
  (`run.googleapis.com`→401, `oauth2`→400, `firebasehosting`/`artifactregistry`/
  `cloudbuild`→404, `storage`→400), porém **hosts de distribuição de software do
  Google bloqueados** (`dl.google.com`, `sdk.cloud.google.com`,
  `packages.cloud.google.com` → **403**). Sem **docker daemon**.
- **Conclusão:** o bloqueio é de **ferramentas**, não de credencial — não é
  possível instalar o `gcloud` nem construir o container do Cloud Run aqui. Logo,
  **fornecer credenciais não destrava o deploy** a partir deste sandbox; só
  exporia um segredo corporativo no transcript. Por isso **não foram coletadas
  credenciais**.
- **Caminho viável (preparado e commitado):** executar a automação em ambiente
  com tooling — (a) `console/scripts/deploy.sh` na máquina do usuário após
  `gcloud auth login` (guiado ao vivo), ou (b) `.github/workflows/deploy-console.yml`
  (GitHub Actions/WIF), ou (c) `console/cloudbuild.yaml` (Cloud Build). Todos usam
  `gcloud run deploy --source` (build no Cloud Build, sem docker local).

## Resumo final
- **10/10 passos** executados, cada um testado e confirmado.
- **10 testes automatizados** passando (gateway 7, web 3); ambos os pacotes
  compilam, typecheck limpo e build OK.
- Itens que dependem de credenciais/infra externos ficam registrados acima como
  pendências, com o contorno usado para não interromper.
