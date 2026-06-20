#!/usr/bin/env bash
# Implanta o setupOS Cloud: gateway → Cloud Run; frontend → Firebase Hosting.
# Usa `gcloud run deploy --source` (build no Cloud Build — dispensa docker local).
# Pré: setup-gcp.sh executado; `gcloud` e `firebase` autenticados.
set -euo pipefail

PROJECT="${PROJECT:?defina PROJECT=<id-do-projeto-gcp>}"
REGION="${REGION:-southamerica-east1}"
DOMAIN="${ALLOWED_DOMAIN:-setup.com.br}"
OPERATOR_ROLES="${OPERATOR_ROLES:-operador,admin}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ">> [1/3] Gateway → Cloud Run"
gcloud run deploy setupos-gateway \
  --source "$ROOT/gateway" \
  --project "$PROJECT" --region "$REGION" \
  --no-allow-unauthenticated \
  --set-env-vars "ALLOWED_DOMAIN=$DOMAIN,GOOGLE_CLOUD_PROJECT=$PROJECT,OPERATOR_ROLES=$OPERATOR_ROLES"

GATEWAY_URL="$(gcloud run services describe setupos-gateway \
  --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo ">> Gateway: $GATEWAY_URL"

echo ">> [2/3] Frontend (build estático)"
cd "$ROOT/web"
[ -f .env.local ] || { echo "ERRO: crie console/web/.env.local (ver .env.example)"; exit 1; }
npm ci
NEXT_PUBLIC_GATEWAY_URL="$GATEWAY_URL" npm run build

echo ">> [3/3] Frontend → Firebase Hosting"
npx --yes firebase-tools deploy --only hosting --project "$PROJECT"

echo ">> Concluído. Health do gateway:"
curl -s "$GATEWAY_URL/healthz" || true
echo
echo ">> Coloque o gateway atrás do IAP liberando o grupo do Cloud Identity."
