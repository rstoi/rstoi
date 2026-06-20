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

## O que falta (executar localmente)
1. `gcloud auth login` e selecionar/criar o projeto GCP (billing ativo).
2. `PROJECT=<id> REGION=southamerica-east1 bash console/scripts/setup-gcp.sh`
   (habilita APIs + Artifact Registry).
3. Firebase Console: ativar provedor **Google** em Authentication e autorizar o
   domínio `setup.com.br`.
4. `console/web/.env.local` com as chaves do Firebase (ver `.env.example`).
5. `firebase login` e `PROJECT=<id> bash console/scripts/deploy.sh`
   (gateway → Cloud Run, frontend → Hosting; usa `gcloud run deploy --source`,
   sem docker local).
6. Colocar o gateway atrás do **IAP** (grupo do Cloud Identity) e popular as
   custom claims `roles` a partir dos grupos do Workspace.
7. Smoke: `curl <GATEWAY_URL>/healthz` e login no Hosting com conta @setup.com.br.

## Prompt para colar na sessão local do Claude Code
> Estou retomando a implantação do setupOS Cloud na minha máquina. Leia
> `console/HANDOFF.md` e `console/IMPLEMENTACAO.md`. Estou na branch
> `claude/inspiring-clarke-j1yrl0`. Tenho `gcloud`, `firebase`, `node` e docker
> instalados e quero fazer o deploy real (Cloud Run + Firebase Hosting).
> Conduza o deploy executando os comandos, um passo por vez, validando cada
> saída. Meu projeto GCP é <ID-DO-PROJETO> (billing ativo). Comece pelo
> `gcloud auth login` e siga o checklist de "O que falta".

## Pré-requisitos na máquina local
- Claude Code instalado e autenticado (Claude Pro/Max ou API).
- `gcloud` (Google Cloud CLI), `firebase-tools`, `node`, `git`.
- Conta com permissão no projeto GCP (Owner/Editor) e billing ativo.
