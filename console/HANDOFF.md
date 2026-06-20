# Handoff — retomar o setupOS Cloud no Claude Code CLI local

Este documento permite que uma **sessão local do Claude Code** (na máquina do
usuário, com `gcloud`/`firebase`/credenciais) retome a implantação exatamente de
onde a sessão na web parou. Todo o estado está no repositório; não é preciso o
histórico do chat.

## Estado atual (o que já está pronto)
- **Console web app** em `console/` (Next.js + gateway Cloud Run), buildando e
  com testes passando (10 testes). Ver `console/IMPLEMENTACAO.md` (log completo).
- **Login restrito a `@setup.com.br`** (Firebase Auth + verificação no gateway) e
  **RBAC** (Terminal/Claude CLI/Governança só para operador) — testados.
- **Automação de deploy** pronta: `console/scripts/setup-gcp.sh`,
  `console/scripts/deploy.sh`, `console/cloudbuild.yaml`,
  `.github/workflows/deploy-console.yml`.

## Por que parou na web
O sandbox remoto bloqueia os hosts de distribuição do Google (não instala
`gcloud`) e não tem docker daemon. O deploy real precisa rodar onde há tooling +
autenticação — **a máquina local** ou CI.

## Parâmetros (ajuste antes de começar)
- `PROJECT_ID`: **`setupos-cloud`** (padrão, alinhado ao `.firebaserc`). IDs de
  projeto são globais e únicos — se já estiver em uso, use algo como
  `setupos-cloud-<sufixo>` e atualize `console/web/.firebaserc`.
- `REGION`: **`southamerica-east1`** (São Paulo).
- `BILLING_ACCOUNT`: pegue com `gcloud billing accounts list`.

## O que falta (executar localmente)
0. **Autenticar e garantir o projeto (criar se não existir) + billing:**
   ```bash
   gcloud auth login
   # criar (ignore o erro se já existir) e selecionar
   gcloud projects create setupos-cloud 2>/dev/null || true
   gcloud config set project setupos-cloud
   # vincular billing (necessário para Cloud Run/Build)
   gcloud billing accounts list
   gcloud billing projects link setupos-cloud --billing-account=<BILLING_ACCOUNT_ID>
   ```
1. `PROJECT=setupos-cloud REGION=southamerica-east1 bash console/scripts/setup-gcp.sh`
   (habilita APIs + Artifact Registry).
2. Firebase Console: ativar provedor **Google** em Authentication e autorizar o
   domínio `setup.com.br`.
3. `console/web/.env.local` com as chaves do Firebase (ver `.env.example`).
4. `firebase login` e `PROJECT=setupos-cloud bash console/scripts/deploy.sh`
   (gateway → Cloud Run, frontend → Hosting; usa `gcloud run deploy --source`,
   sem docker local).
5. Colocar o gateway atrás do **IAP** (grupo do Cloud Identity) e popular as
   custom claims `roles` a partir dos grupos do Workspace.
6. Smoke: `curl <GATEWAY_URL>/healthz` e login no Hosting com conta @setup.com.br.

## Prompt para colar na sessão local do Claude Code
> Estou retomando a implantação do setupOS Cloud na minha máquina. Leia
> `console/HANDOFF.md` e `console/IMPLEMENTACAO.md`. Estou na branch
> `claude/inspiring-clarke-j1yrl0`. Tenho `gcloud`, `firebase`, `node` e docker
> instalados e quero fazer o **deploy real** (Cloud Run + Firebase Hosting).
> Use o projeto `setupos-cloud` na região `southamerica-east1`; **se o projeto
> não existir, crie-o e vincule o billing** (me peça a conta de billing se
> precisar). Conduza o deploy executando os comandos, **um passo por vez,
> validando cada saída antes de seguir**, exatamente pelo checklist "O que falta"
> (passos 0 a 6). Comece pelo `gcloud auth login`.

## Pré-requisitos na máquina local
- Claude Code instalado e autenticado (Claude Pro/Max ou API).
- `gcloud` (Google Cloud CLI), `firebase-tools`, `node`, `git`.
- Conta com permissão no projeto GCP (Owner/Editor) e billing ativo.
