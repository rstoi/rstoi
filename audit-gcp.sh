#!/usr/bin/env bash
# Auditoria GCP — Baita Aceleradora · Autor: Renato Toi
# Pré-requisito: gcloud auth login (conta renato@baita.ac)
# Uso no Claude Code: "execute audit-gcp.sh e analise o resultado"
#
# Ambiente sem gcloud (ex.: container efêmero do Claude Code na web)?
# Use o auditor REST equivalente, que só precisa de um access token curto:
#   GCP_TOKEN="$(gcloud auth print-access-token)" python3 scripts/audit-gcp-rest.py
set -uo pipefail

echo "== Conta ativa =="
gcloud auth list --filter=status:ACTIVE --format="value(account)"

echo; echo "== Projetos =="
gcloud projects list --format="table(projectId,name,lifecycleState)"

for P in $(gcloud projects list --format="value(projectId)"); do
  echo; echo "########## PROJETO: $P ##########"

  echo "-- APIs habilitadas (serviços) --"
  gcloud services list --enabled --project "$P" \
    --format="value(config.name)" 2>/dev/null | sort

  echo "-- Instâncias Compute Engine --"
  gcloud compute instances list --project "$P" \
    --format="table(name,zone,machineType.basename(),status,disks[0].diskSizeGb)" 2>/dev/null

  echo "-- Cloud Run (serviços e jobs) --"
  gcloud run services list --project "$P" --platform managed \
    --format="table(metadata.name,status.url,status.conditions[0].status)" 2>/dev/null
  gcloud run jobs list --project "$P" \
    --format="table(metadata.name,status.latestCreatedExecution.name)" 2>/dev/null

  echo "-- Cloud Functions --"
  gcloud functions list --project "$P" \
    --format="table(name,state,environment)" 2>/dev/null

  echo "-- Cloud Scheduler (crons) --"
  gcloud scheduler jobs list --project "$P" \
    --format="table(name.basename(),schedule,state)" 2>/dev/null

  echo "-- BigQuery datasets --"
  bq ls --project_id="$P" 2>/dev/null

  echo "-- Contas de serviço --"
  gcloud iam service-accounts list --project "$P" \
    --format="table(email,disabled)" 2>/dev/null

  echo "-- Discos não anexados (custo ocioso) --"
  gcloud compute disks list --project "$P" \
    --filter="-users:*" --format="table(name,zone,sizeGb)" 2>/dev/null

  echo "-- IPs estáticos reservados sem uso (custo ocioso) --"
  gcloud compute addresses list --project "$P" \
    --filter="status=RESERVED" --format="table(name,region,address)" 2>/dev/null
done

echo; echo "== Fim. Dentro de cada VM, verifique crons dos agentes: =="
echo "   gcloud compute ssh <vm> --command='crontab -l; systemctl list-timers'"
