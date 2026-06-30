#!/usr/bin/env bash
# Constrói e publica a imagem do serviço de controle e aponta o Cloud Run para ela.
# Rode depois do primeiro `terraform apply` (que cria o Artifact Registry e o serviço).
set -euo pipefail

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project)}"
REGION="${GCP_REGION:-us-central1}"
REPO="claude-control"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/control:$(date +%Y%m%d-%H%M%S)"
SRC_DIR="$(cd "$(dirname "$0")/../control" && pwd)"

echo "==> build & push ${IMAGE}"
gcloud builds submit "${SRC_DIR}" --tag "${IMAGE}" --project "${PROJECT}"

echo "==> apontando Cloud Run claude-control para a nova imagem"
gcloud run services update claude-control \
  --region "${REGION}" --project "${PROJECT}" --image "${IMAGE}"

echo "OK. Imagem publicada e em uso: ${IMAGE}"
