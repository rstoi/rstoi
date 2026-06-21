#!/usr/bin/env bash
# =============================================================================
# deploy-all.sh — Implantação ponta a ponta do setupOS Cloud, resiliente.
#
# RECURSOS
#   • Idempotente + checkpoints  -> re-rodar retoma de onde parou.
#   • Log completo de cada execução em console/.deploy-state/run-*.log
#   • Captura de erro com contexto (fase, linha, comando, código, saída).
#   • Autodiagnóstico por assinatura de erro + autocorreção do que dá.
#   • Retry com backoff para falhas transitórias (rede/API).
#   • Cada fase roda isolada (subshell) — uma falha não derruba o resto;
#     o orquestrador tenta corrigir e retoma (até MAX_RUN ciclos).
#   • Relatório final compacto (console/.deploy-state/report.txt) + opcional
#     upload em Gist secreto (gh) para encaminhamento.
#
# USO (Git Bash, a partir da raiz do repo):
#   bash console/scripts/deploy-all.sh
#
# OVERRIDES (env):
#   PROJECT REGION ALLOWED_DOMAIN BILLING_ACCOUNT OPERATOR_ROLES WEB_APP_NAME
#   ALLOW_UNAUTH=true|false  FORCE_ENV=true|false  MAX_RUN=3  UPLOAD=auto|off
# =============================================================================
set -uo pipefail
set -E   # ERR trap propaga p/ funções/subshells

# ---- Config -----------------------------------------------------------------
PROJECT="${PROJECT:-setupos-cloud}"
REGION="${REGION:-southamerica-east1}"
DOMAIN="${ALLOWED_DOMAIN:-setup.com.br}"
OPERATOR_ROLES="${OPERATOR_ROLES:-operador,admin}"
WEB_APP_NAME="${WEB_APP_NAME:-setupos-console}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-}"
ALLOW_UNAUTH="${ALLOW_UNAUTH:-true}"
FORCE_ENV="${FORCE_ENV:-false}"
MAX_RUN="${MAX_RUN:-3}"
UPLOAD="${UPLOAD:-auto}"
GATEWAY_SERVICE="setupos-gateway"

# ---- UI ---------------------------------------------------------------------
b()    { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[1;33m! %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ ERRO FATAL: %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

WARNINGS=()
note() { WARNINGS+=("$*"); warn "$*"; }

# ---- Raiz do repo -----------------------------------------------------------
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
ROOT="$(find_root)" || die "não encontrei 'console/'. Rode da raiz do repo (ou 'git checkout main')."
CONSOLE="$ROOT/console"
STATE="$CONSOLE/.deploy-state"
mkdir -p "$STATE"
LOG="$STATE/run-$(date +%Y%m%d-%H%M%S).log"
REPORT="$STATE/report.txt"

# ---- Log: tudo para tela + arquivo -----------------------------------------
exec > >(tee -a "$LOG") 2>&1
echo "log: $LOG"
ok "Repositório: $ROOT"

# ---- Captura de erro --------------------------------------------------------
CUR_PHASE="(init)"
on_err() {
  local rc=$? line=${1:-?} cmd=${2:-?}
  printf '\n\033[1;31m✗ FALHA\033[0m fase=%s linha=%s código=%s\n   cmd: %s\n' \
    "$CUR_PHASE" "$line" "$rc" "$cmd" >&2
  return $rc
}
trap 'on_err "$LINENO" "$BASH_COMMAND"' ERR

# ---- Helpers de fluxo -------------------------------------------------------
cp_done() { [ -f "$STATE/done.$1" ]; }
cp_set()  { date +%s > "$STATE/done.$1"; }
sval()    { cat "$STATE/$1" 2>/dev/null || true; }   # lê valor de estado
sset()    { printf '%s' "$2" > "$STATE/$1"; }        # grava valor de estado

# retry <n> <sleep-base> -- <cmd...>
retry() {
  local n="$1" base="$2"; shift 2; [ "$1" = "--" ] && shift
  local i=1 rc=0
  while :; do
    if "$@"; then return 0; fi
    rc=$?
    [ "$i" -ge "$n" ] && return $rc
    warn "tentativa $i/$n falhou (código $rc); aguardando $((base*i))s…"
    sleep $((base*i)); i=$((i+1))
  done
}

# chamada à API Google (firebase/identitytoolkit). Ecoa o corpo; retorna !=0 se "error".
gapi() { # método url [json]
  local m="$1" u="$2" body="${3:-}" tok resp
  tok="$(gcloud auth print-access-token 2>/dev/null)" || return 3
  if [ -n "$body" ]; then
    resp="$(curl -sS -X "$m" "$u" -H "Authorization: Bearer $tok" \
              -H "Content-Type: application/json" -d "$body")" || return 4
  else
    resp="$(curl -sS -X "$m" "$u" -H "Authorization: Bearer $tok")" || return 4
  fi
  printf '%s' "$resp"
  printf '%s' "$resp" | grep -q '"error"' && return 5 || return 0
}

# extrai campo simples de JSON via node
jval() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const p=process.argv[1].split(".");let v=j;for(const k of p)v=v&&v[k];process.stdout.write(v==null?"":String(v))}catch(e){}})' "$1"; }

# ---- Autodiagnóstico por assinatura ----------------------------------------
diagnose() { # recebe texto (saída do erro); ecoa CAUSA|AUTO|DICA
  local t="$1"
  case "$t" in
    *"already in use by another project"*)
      echo "ID de projeto já usado por terceiros|NAO|Rode com PROJECT=<outro-id> e ajuste console/web/.firebaserc.";;
    *"billing"*|*"BILLING"*|*"FAILED_PRECONDITION"*billing*)
      echo "Billing não vinculado|SIM|O script vincula automaticamente na Fase 3.";;
    *"Creating your Web app"*|*"webApps"*"PERMISSION"*)
      echo "Falha do CLI ao criar app web|SIM|O script usa a API REST do Firebase como alternativa.";;
    *"allowedPolicyMemberDomains"*|*"allUsers"*"violates"*|*"Domain Restricted Sharing"*)
      echo "Política da org bloqueia acesso público (allUsers)|NAO|Use IAP (HANDOFF passo 5) ou ajuste a policy org.";;
    *"PERMISSION_DENIED"*|*"403"*|*"does not have permission"*)
      echo "Permissão/IAM insuficiente|NAO|Garanta papel Owner/Editor na conta logada.";;
    *"RESOURCE_EXHAUSTED"*|*"Quota"*|*"quota"*)
      echo "Quota excedida|NAO|Solicite aumento de quota ou troque de região.";;
    *"could not resolve host"*|*"Could not resolve"*|*"timed out"*|*"Temporary failure"*|*"503"*|*"502"*)
      echo "Falha transitória de rede/API|SIM|O script repete com backoff.";;
    *"Cannot find module"*|*"npm ci"*|*"ERR!"*)
      echo "Build do frontend (npm) falhou|PARC|Verifique Node LTS; o script roda 'npm ci' de novo.";;
    *) echo "Causa não catalogada|NAO|Veja o log: $LOG";;
  esac
}

capture_failure() {
  local phase="$1" rc="$2"
  local tail_log; tail_log="$(tail -n 40 "$LOG" 2>/dev/null)"
  local d cause auto tip; d="$(diagnose "$tail_log")"
  cause="${d%%|*}"; auto="$(echo "$d"|cut -d'|' -f2)"; tip="${d##*|}"
  {
    echo "===== DIAGNÓSTICO ($(date -u +%FT%TZ)) ====="
    echo "Fase falha : $phase"
    echo "Código     : $rc"
    echo "Causa      : $cause"
    echo "Autocorrige: $auto"
    echo "Encaminham.: $tip"
    echo "----- últimas linhas do log -----"
    echo "$tail_log"
    echo "================================="
  } > "$REPORT"
  printf '\n\033[1;31m■ DIAGNÓSTICO\033[0m fase=%s causa=%s autocorrige=%s\n   %s\n' \
    "$phase" "$cause" "$auto" "$tip"
  LAST_AUTO="$auto"
}

# run_phase <id> <título> <função> : roda isolado; checkpoint no sucesso.
run_phase() {
  local id="$1" title="$2" fn="$3"
  CUR_PHASE="$title"
  if cp_done "$id"; then ok "[$title] já concluído (checkpoint) — pulando"; return 0; fi
  b "$title"
  if ( set -e; "$fn" ); then cp_set "$id"; return 0
  else local rc=$?; capture_failure "$title" "$rc"; return $rc; fi
}

# =============================================================================
# FASES
# =============================================================================
ph_tools() {
  local miss=() c
  for c in gcloud firebase node npm curl; do have "$c" || miss+=("$c"); done
  if [ "${#miss[@]}" -gt 0 ]; then
    info "Faltando: ${miss[*]}"
    info "gcloud→winget install Google.CloudSDK | firebase→npm i -g firebase-tools | node→winget install OpenJS.NodeJS.LTS"
    return 1
  fi
  ok "gcloud, firebase, node, npm, curl presentes"
}

ph_auth() {
  if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
    warn "sem conta gcloud ativa — abrindo navegador…"; gcloud auth login
  fi
  ok "gcloud: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"
  if ! firebase login:list 2>/dev/null | grep -qiE '@'; then
    warn "firebase CLI sem login — abrindo navegador…"; firebase login
  fi
  ok "firebase CLI autenticado"
}

ph_project() {
  if gcloud projects describe "$PROJECT" >/dev/null 2>&1; then ok "projeto existe"
  else warn "criando projeto…"; gcloud projects create "$PROJECT"; ok "projeto criado"; fi
  gcloud config set project "$PROJECT" >/dev/null; ok "projeto ativo"
}

ph_billing() {
  local on; on="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo False)"
  [ "$on" = "True" ] && { ok "billing já vinculado"; return 0; }
  if [ -z "$BILLING_ACCOUNT" ]; then
    local accts; mapfile -t accts < <(gcloud billing accounts list --filter='open=true' --format='value(name)' 2>/dev/null)
    case "${#accts[@]}" in
      1) BILLING_ACCOUNT="${accts[0]##*/}";;
      0) info "Nenhuma conta de billing aberta."; return 1;;
      *) info "Várias contas — defina BILLING_ACCOUNT=<ID>."; return 1;;
    esac
  fi
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING_ACCOUNT"
  ok "billing vinculado: $BILLING_ACCOUNT"
}

ph_apis() {
  retry 3 5 -- gcloud services enable \
    run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    iap.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
    identitytoolkit.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com \
    --project "$PROJECT"
  ok "APIs habilitadas"
  gcloud artifacts repositories create setupos --repository-format=docker \
    --location="$REGION" --description="setupOS Cloud" --project "$PROJECT" 2>/dev/null \
    && ok "Artifact Registry criado" || ok "Artifact Registry pronto"
}

ph_firebase_app() {
  retry 2 3 -- firebase projects:addfirebase "$PROJECT" >/dev/null 2>&1 \
    && ok "Firebase ativado" || ok "Firebase já ativo"

  local env="$CONSOLE/web/.env.local"
  if [ -f "$env" ] && [ "$FORCE_ENV" != "true" ]; then ok ".env.local já existe"; return 0; fi

  # 1) reaproveita app web existente (REST)
  local list appid
  list="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps")" || true
  appid="$(printf '%s' "$list" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=(j.apps||[])[0];process.stdout.write(a?a.appId:"")}catch(e){}})')"

  # 2) cria via REST se não houver
  if [ -z "$appid" ]; then
    warn "criando app web via API REST…"
    gapi POST "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps" "{\"displayName\":\"$WEB_APP_NAME\"}" >/dev/null || true
    local i
    for i in $(seq 1 40); do
      list="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps")" || true
      appid="$(printf '%s' "$list" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=(j.apps||[])[0];process.stdout.write(a?a.appId:"")}catch(e){}})')"
      [ -n "$appid" ] && break
      sleep 3
    done
  fi
  [ -n "$appid" ] || { info "não consegui obter App ID (REST). Resposta: $(printf '%s' "$list"|tr -d '\n'|cut -c1-160)"; return 1; }
  ok "App ID: $appid"

  # 3) config (REST)
  local cfg
  cfg="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps/$appid/config")" \
    || { info "falha ao obter config do app web."; return 1; }
  local apikey authdom projid
  apikey="$(printf '%s' "$cfg" | jval apiKey)"
  authdom="$(printf '%s' "$cfg" | jval authDomain)"
  projid="$(printf '%s' "$cfg" | jval projectId)"
  [ -n "$apikey" ] || { info "config sem apiKey: $(printf '%s' "$cfg"|tr -d '\n'|cut -c1-160)"; return 1; }

  mkdir -p "$CONSOLE/web"
  cat > "$env" <<EOF
# Gerado por deploy-all.sh — Firebase (cliente) do projeto $PROJECT
NEXT_PUBLIC_FIREBASE_API_KEY=$apikey
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$authdom
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$projid
NEXT_PUBLIC_FIREBASE_APP_ID=$appid
NEXT_PUBLIC_ALLOWED_DOMAIN=$DOMAIN
NEXT_PUBLIC_GATEWAY_URL=https://$GATEWAY_SERVICE.$REGION.run.app
EOF
  ok ".env.local gerado"
}

ph_google_provider() {
  local api="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT"
  local resp
  resp="$(gapi POST "$api/defaultSupportedIdpConfigs?idpId=google.com" '{"enabled":true}')" || true
  if printf '%s' "$resp" | grep -q '"enabled": *true'; then ok "login Google habilitado"; return 0; fi
  if printf '%s' "$resp" | grep -qi 'ALREADY_EXISTS\|already exists'; then
    gapi PATCH "$api/defaultSupportedIdpConfigs/google.com?updateMask=enabled" '{"enabled":true}' >/dev/null || true
    ok "login Google já existia (habilitado)"; return 0
  fi
  note "não habilitei o login Google via API — ligue no Firebase Console > Authentication > Google. ($(printf '%s' "$resp"|tr -d '\n'|cut -c1-140))"
}

ph_deploy() {
  PROJECT="$PROJECT" REGION="$REGION" ALLOWED_DOMAIN="$DOMAIN" OPERATOR_ROLES="$OPERATOR_ROLES" \
    bash "$CONSOLE/scripts/deploy.sh"
  local url; url="$(gcloud run services describe "$GATEWAY_SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
  [ -n "$url" ] && { sset gateway_url "$url"; ok "Gateway: $url"; } || note "sem URL do gateway."
}

ph_access() {
  [ "$ALLOW_UNAUTH" = "true" ] || { note "ALLOW_UNAUTH=false — gateway privado (configure IAP, HANDOFF passo 5)."; return 0; }
  if gcloud run services add-iam-policy-binding "$GATEWAY_SERVICE" --region "$REGION" --project "$PROJECT" \
        --member=allUsers --role=roles/run.invoker >/dev/null 2>&1; then
    ok "gateway público (token Firebase é verificado no próprio gateway)"
  else
    note "org bloqueia allUsers — configure IAP (HANDOFF passo 5) para o frontend alcançar o gateway."
  fi
}

ph_smoke() {
  local url; url="$(sval gateway_url)"
  if [ -n "$url" ]; then
    local code; code="$(curl -s -o /dev/null -w '%{http_code}' "$url/healthz" || echo 000)"
    case "$code" in
      200) ok "healthz 200";;
      401|403) ok "healthz $code (auth exigida — ok se privado/IAP)";;
      *) note "healthz HTTP $code — confira logs do Cloud Run.";;
    esac
  fi
  ok "Frontend (Hosting): https://$PROJECT.web.app"
}

# =============================================================================
# ORQUESTRADOR — corrige e retoma (até MAX_RUN ciclos)
# =============================================================================
run_pipeline() {
  run_phase tools   "FASE 0 — Ferramentas"            ph_tools          || return 1
  run_phase auth    "FASE 1 — Autenticação"           ph_auth           || return 1
  run_phase project "FASE 2 — Projeto GCP"            ph_project        || return 1
  run_phase billing "FASE 3 — Billing"                ph_billing        || return 1
  run_phase apis    "FASE 4 — APIs + Artifact Reg."   ph_apis           || return 1
  run_phase fbapp   "FASE 5 — Firebase app + .env"    ph_firebase_app   || return 1
  run_phase google  "FASE 6 — Provedor Google"        ph_google_provider|| return 1
  run_phase deploy  "FASE 7 — Deploy (Run + Hosting)" ph_deploy         || return 1
  run_phase access  "FASE 8 — Acesso ao gateway"      ph_access         || return 1
  run_phase smoke   "FASE 9 — Smoke test"             ph_smoke          || return 1
  return 0
}

upload_report() {
  [ "$UPLOAD" = "off" ] && return 0
  have gh || return 0
  local url
  url="$(gh gist create --desc "deploy-all setupOS $(date -u +%FT%TZ)" "$REPORT" "$LOG" 2>/dev/null || true)"
  [ -n "$url" ] && info "Diagnóstico publicado (gist secreto): $url"
}

main() {
  local run=1
  while :; do
    info "Ciclo $run/$MAX_RUN"
    if run_pipeline; then
      b "RESULTADO: SUCESSO"
      ok "Projeto $PROJECT ($REGION)"
      ok "Gateway:  $(sval gateway_url)"
      ok "Frontend: https://$PROJECT.web.app  (login restrito a @$DOMAIN)"
      if [ "${#WARNINGS[@]}" -gt 0 ]; then
        printf '\n   \033[1;33mPendências:\033[0m\n'; for w in "${WARNINGS[@]}"; do echo "     - $w"; done
      else ok "sem pendências 🎉"; fi
      echo; echo "Próximo opcional (HANDOFF passo 5): IAP + custom claims via Workspace."
      return 0
    fi
    if [ "$run" -ge "$MAX_RUN" ]; then
      b "RESULTADO: INTERROMPIDO após $run ciclos"
      cat "$REPORT" 2>/dev/null
      upload_report
      echo; warn "Re-rode o script: ele retoma pelos checkpoints. Cole o bloco DIAGNÓSTICO acima se precisar de ajuda."
      return 1
    fi
    warn "tentando corrigir e retomar (autocorrige=${LAST_AUTO:-?})…"
    run=$((run+1)); sleep $((run*4))
  done
}

main "$@"
