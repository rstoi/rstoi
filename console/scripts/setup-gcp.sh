#!/usr/bin/env bash
# Provisiona a base do setupOS Cloud em um projeto GCP. Idempotente.
# Pré: `gcloud auth login` (ou service account) e PROJECT/REGION definidos.
set -euo pipefail

PROJECT="${PROJECT:?defina PROJECT=<id-do-projeto-gcp>}"
REGION="${REGION:-southamerica-east1}"
DOMAIN="${ALLOWED_DOMAIN:-setup.com.br}"

echo ">> Projeto: $PROJECT  Região: $REGION  Domínio: $DOMAIN"
gcloud config set project "$PROJECT"

echo ">> Habilitando APIs…"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iap.googleapis.com \
  firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com \
  secretmanager.googleapis.com

echo ">> Artifact Registry (repo de containers)…"
gcloud artifacts repositories create setupos \
  --repository-format=docker --location="$REGION" \
  --description="setupOS Cloud" 2>/dev/null || echo "   (repo já existe)"

echo ">> Pronto. Próximo: console/scripts/deploy.sh"
echo "   Lembre de habilitar o provedor Google no Firebase Auth e autorizar o"
echo "   domínio $DOMAIN no console do Firebase (Authentication > Settings)."
