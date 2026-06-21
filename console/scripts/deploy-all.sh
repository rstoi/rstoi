#!/usr/bin/env bash
# =============================================================================
# deploy-all.sh — Implantação ponta a ponta do setupOS Cloud (baitaos-setup).
#
# IDEMPOTENTE: pode ser executado quantas vezes for preciso. Cada fase detecta
# o que já está pronto e pula; se algo faltar, executa; se precisar de uma ação
# humana (login no navegador), o script conduz e segue.
#
# Uso (Git Bash no Windows, a partir da raiz do repositório):
#   bash console/scripts/deploy-all.sh
#
# Variáveis opcionais (override):
#   PROJECT=setupos-cloud  REGION=southamerica-east1  ALLOWED_DOMAIN=setup.com.br
#   BILLING_ACCOUNT=01AD8D-BBC03B-A77E35   (auto se houver só uma conta aberta)
#   OPERATOR_ROLES=operador,admin
#   WEB_APP_NAME=setupos-console
#   ALLOW_UNAUTH=true      (gateway público + checagem do token Firebase no app;
#                           use false se for proteger via IAP manualmente)
#   FORCE_ENV=false        (true reescreve console/web/.env.local)
# =============================================================================
set -uo pipefail

# ---- Config -----------------------------------------------------------------
PROJECT="${PROJECT:-setupos-cloud}"
REGION="${REGION:-southamerica-east1}"
DOMAIN="${ALLOWED_DOMAIN:-setup.com.br}"
OPERATOR_ROLES="${OPERATOR_ROLES:-operador,admin}"
WEB_APP_NAME="${WEB_APP_NAME:-setupos-console}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-}"
ALLOW_UNAUTH="${ALLOW_UNAUTH:-true}"
FORCE_ENV="${FORCE_ENV:-false}"
GATEWAY_SERVICE="setupos-gateway"

# ---- Estética / helpers -----------------------------------------------------
b()    { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ ERRO: %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

WARNINGS=()
note() { WARNINGS+=("$*"); warn "$*"; }

# ---- Descobre a raiz do repo (pasta que contém console/gateway) -------------
find_root() {
  local d
  for d in "$PWD" "$(cd "$(dirname "$0")" 2>/dev/null && pwd)"; do
    while [ -n "$d" ] && [ "$d" != "/" ]; do
      [ -d "$d/console/gateway" ] && { echo "$d"; return 0; }
      d="$(dirname "$d")"
    done
  done
  return 1
}
ROOT="$(find_root)" || die "não encontrei a pasta 'console/'. Rode a partir da raiz do repo (ou faça 'git checkout main' se a branch atual não tiver os scripts de deploy)."
CONSOLE="$ROOT/console"
ok "Repositório: $ROOT"

# =============================================================================
b "FASE 0 — Ferramentas"
MISSING=()
for c in gcloud firebase node npm curl; do have "$c" || MISSING+=("$c"); done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "   Faltando: ${MISSING[*]}"
  echo "   Instale:  gcloud → winget install Google.CloudSDK"
  echo "             firebase → npm install -g firebase-tools"
  echo "             node/npm → winget install OpenJS.NodeJS.LTS"
  die "instale as ferramentas acima, reabra o terminal e rode de novo."
fi
ok "gcloud, firebase, node, npm, curl presentes"

# =============================================================================
b "FASE 1 — Autenticação"
# gcloud
if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  warn "nenhuma conta gcloud ativa — abrindo login no navegador…"
  gcloud auth login || die "falha no 'gcloud auth login'."
fi
ACCT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"
ok "gcloud autenticado: $ACCT"
# Application Default Credentials (a API do Firebase Auth usa o access token do gcloud)
# firebase CLI
if ! firebase login:list 2>/dev/null | grep -qiE '@'; then
  warn "firebase CLI sem login — abrindo navegador…"
  firebase login || die "falha no 'firebase login'."
fi
ok "firebase CLI autenticado"

# =============================================================================
b "FASE 2 — Projeto GCP ($PROJECT)"
if gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  ok "projeto já existe"
else
  warn "projeto não existe — criando…"
  gcloud projects create "$PROJECT" \
    || die "não consegui criar '$PROJECT' (ID pode estar em uso por terceiros). Rode de novo com PROJECT=<outro-id> e ajuste console/web/.firebaserc."
  ok "projeto criado"
fi
gcloud config set project "$PROJECT" >/dev/null
ok "projeto ativo no gcloud"

# =============================================================================
b "FASE 3 — Billing"
BILLING_ON="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo False)"
if [ "$BILLING_ON" = "True" ]; then
  ok "billing já vinculado"
else
  if [ -z "$BILLING_ACCOUNT" ]; then
    mapfile -t ACCTS < <(gcloud billing accounts list --filter='open=true' --format='value(name)' 2>/dev/null)
    if   [ "${#ACCTS[@]}" -eq 1 ]; then BILLING_ACCOUNT="${ACCTS[0]##*/}"
    elif [ "${#ACCTS[@]}" -eq 0 ]; then die "nenhuma conta de billing aberta. Crie em https://console.cloud.google.com/billing e rode de novo."
    else die "várias contas de billing. Rode de novo com BILLING_ACCOUNT=<ID> (veja 'gcloud billing accounts list')."
    fi
  fi
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING_ACCOUNT" \
    || die "falha ao vincular billing ($BILLING_ACCOUNT)."
  ok "billing vinculado: $BILLING_ACCOUNT"
fi

# =============================================================================
b "FASE 4 — APIs + Artifact Registry"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  iap.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com \
  --project "$PROJECT" || die "falha ao habilitar APIs."
ok "APIs habilitadas"
gcloud artifacts repositories create setupos \
  --repository-format=docker --location="$REGION" --description="setupOS Cloud" \
  --project "$PROJECT" 2>/dev/null && ok "Artifact Registry 'setupos' criado" || ok "Artifact Registry pronto (já existia)"

# =============================================================================
b "FASE 5 — Firebase: app web + chaves (.env.local)"
firebase projects:addfirebase "$PROJECT" >/dev/null 2>&1 && ok "Firebase ativado no projeto" || ok "Firebase já ativo no projeto"

ENV_FILE="$CONSOLE/web/.env.local"
if [ -f "$ENV_FILE" ] && [ "$FORCE_ENV" != "true" ]; then
  ok ".env.local já existe (use FORCE_ENV=true para reescrever)"
else
  # Reaproveita um app web existente; senão cria.
  APP_ID="$(firebase apps:list WEB --project "$PROJECT" 2>/dev/null | grep -oE '1:[0-9]+:web:[a-f0-9]+' | head -1 || true)"
  if [ -z "$APP_ID" ]; then
    warn "criando app web '$WEB_APP_NAME'…"
    firebase apps:create WEB "$WEB_APP_NAME" --project "$PROJECT" >/dev/null \
      || die "falha ao criar o app web no Firebase."
    APP_ID="$(firebase apps:list WEB --project "$PROJECT" 2>/dev/null | grep -oE '1:[0-9]+:web:[a-f0-9]+' | head -1)"
  fi
  [ -n "$APP_ID" ] || die "não consegui obter o App ID do Firebase."
  ok "App ID: $APP_ID"

  CFG="$(firebase apps:sdkconfig WEB "$APP_ID" --project "$PROJECT" --json 2>/dev/null)" \
    || die "falha ao obter o sdkconfig do Firebase."
  # Extrai os campos com node (garantido na máquina).
  read -r API_KEY AUTH_DOMAIN PROJ_ID APP_OUT < <(
    node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        const j=JSON.parse(s); const c=(j.result&&j.result.sdkConfig)||j.sdkConfig||j;
        process.stdout.write([c.apiKey,c.authDomain,c.projectId,c.appId].join(" "));
      });' <<<"$CFG"
  )
  [ -n "${API_KEY:-}" ] || die "não consegui extrair as chaves do Firebase do sdkconfig."

  mkdir -p "$CONSOLE/web"
  cat > "$ENV_FILE" <<EOF
# Gerado por deploy-all.sh — Firebase (cliente) do projeto $PROJECT
NEXT_PUBLIC_FIREBASE_API_KEY=$API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$PROJ_ID
NEXT_PUBLIC_FIREBASE_APP_ID=$APP_OUT
NEXT_PUBLIC_ALLOWED_DOMAIN=$DOMAIN
# A URL real do gateway é injetada no build pelo deploy.sh; placeholder abaixo.
NEXT_PUBLIC_GATEWAY_URL=https://$GATEWAY_SERVICE.$REGION.run.app
EOF
  ok ".env.local gerado em console/web/.env.local"
fi

# =============================================================================
b "FASE 6 — Firebase Auth: provedor Google (best-effort)"
TOKEN="$(gcloud auth print-access-token 2>/dev/null || true)"
if [ -n "$TOKEN" ]; then
  API="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT"
  # cria o IdP google.com; se já existir, faz PATCH para habilitar
  RESP="$(curl -s -X POST "$API/defaultSupportedIdpConfigs?idpId=google.com" \
            -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
            -d '{"enabled":true}')"
  if echo "$RESP" | grep -q '"enabled": *true'; then
    ok "provedor Google habilitado"
  elif echo "$RESP" | grep -qi 'ALREADY_EXISTS\|already exists'; then
    curl -s -X PATCH "$API/defaultSupportedIdpConfigs/google.com?updateMask=enabled" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"enabled":true}' >/dev/null && ok "provedor Google já existia (confirmado habilitado)"
  else
    note "não consegui habilitar o login Google via API. Habilite manualmente: Firebase Console > Authentication > Sign-in method > Google > Enable. (resposta: $(echo "$RESP" | tr -d '\n' | cut -c1-160))"
  fi
else
  note "sem access token do gcloud para configurar o Auth; habilite o Google manualmente no Firebase Console."
fi

# =============================================================================
b "FASE 7 — Deploy (gateway → Cloud Run, frontend → Hosting)"
PROJECT="$PROJECT" REGION="$REGION" ALLOWED_DOMAIN="$DOMAIN" OPERATOR_ROLES="$OPERATOR_ROLES" \
  bash "$CONSOLE/scripts/deploy.sh" || die "o deploy.sh falhou (veja o log acima)."

GATEWAY_URL="$(gcloud run services describe "$GATEWAY_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
[ -n "$GATEWAY_URL" ] && ok "Gateway: $GATEWAY_URL" || note "não obtive a URL do gateway."

# =============================================================================
b "FASE 8 — Acesso ao gateway"
if [ "$ALLOW_UNAUTH" = "true" ]; then
  if gcloud run services add-iam-policy-binding "$GATEWAY_SERVICE" \
        --region "$REGION" --project "$PROJECT" \
        --member=allUsers --role=roles/run.invoker >/dev/null 2>&1; then
    ok "gateway público (a verificação do token Firebase acontece no próprio gateway)"
  else
    note "não consegui tornar o gateway público (política da org pode bloquear allUsers). Configure IAP ou ajuste a política, senão o frontend não alcança o gateway."
  fi
else
  note "ALLOW_UNAUTH=false: gateway continua privado. Configure o IAP liberando o grupo do Cloud Identity (HANDOFF passo 5)."
fi

# =============================================================================
b "FASE 9 — Smoke test"
if [ -n "${GATEWAY_URL:-}" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$GATEWAY_URL/healthz" || echo 000)"
  case "$CODE" in
    200) ok "healthz respondeu 200" ;;
    401|403) ok "healthz exige auth ($CODE) — esperado se o gateway estiver privado/IAP" ;;
    *) note "healthz retornou HTTP $CODE (verifique os logs do Cloud Run)." ;;
  esac
fi
HOST_URL="https://$PROJECT.web.app"
ok "Frontend (Hosting): $HOST_URL"

# =============================================================================
b "RESUMO"
echo "   Projeto:     $PROJECT  ($REGION)"
echo "   Gateway:     ${GATEWAY_URL:-<n/d>}"
echo "   Frontend:    $HOST_URL"
echo "   Login:       restrito a @$DOMAIN"
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf '\n   \033[1;33mPendências/atenção:\033[0m\n'
  for w in "${WARNINGS[@]}"; do echo "     - $w"; done
else
  ok "tudo concluído sem pendências 🎉"
fi
echo
echo "   Próximo (opcional, HANDOFF passo 5): IAP + custom claims 'roles' a partir"
echo "   dos grupos do Workspace, para liberar Terminal/Claude CLI por RBAC."
