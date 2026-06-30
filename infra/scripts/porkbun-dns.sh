#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cria/atualiza os registros A no Porkbun apontando os hostnames para o IP fixo
# do Load Balancer. Roda DEPOIS do `terraform apply` (o IP já existe).
#
# Credenciais via ambiente (nunca no repo):
#   export PORKBUN_API_KEY=pk1_...
#   export PORKBUN_SECRET_API_KEY=sk1_...
#
# Uso:
#   bash infra/scripts/porkbun-dns.sh                 # usa baita.one, subs app/claude
#   DOMAIN=baita.one SUBS="app claude" bash infra/scripts/porkbun-dns.sh
#   IP=34.8.1.2 bash infra/scripts/porkbun-dns.sh     # IP manual (pula terraform)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${DOMAIN:-baita.one}"
SUBS="${SUBS:-app claude}"
TTL="${TTL:-300}"
API="${PORKBUN_API:-https://api.porkbun.com/api/json/v3}"
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"

: "${PORKBUN_API_KEY:?defina PORKBUN_API_KEY no ambiente}"
: "${PORKBUN_SECRET_API_KEY:?defina PORKBUN_SECRET_API_KEY no ambiente}"

# IP do LB: do output do Terraform, salvo passado em IP=...
IP="${IP:-$(terraform -chdir="${TF_DIR}" output -raw load_balancer_ip 2>/dev/null || true)}"
[ -n "${IP}" ] || { echo "ERRO: IP do LB não encontrado. Rode 'terraform apply' antes ou passe IP=..."; exit 1; }
echo "Domínio: ${DOMAIN}  |  IP do LB: ${IP}"

auth() { printf '"apikey":"%s","secretapikey":"%s"' "${PORKBUN_API_KEY}" "${PORKBUN_SECRET_API_KEY}"; }

pb() { # pb <path> <json-body-extra>
  local path="$1" extra="${2:-}"
  local body="{$(auth)${extra:+,$extra}}"
  curl -s -X POST "${API}/${path}" -H "Content-Type: application/json" -d "${body}"
}

# valida credenciais
ping_status="$(pb ping | { command -v jq >/dev/null && jq -r .status || cat; })"
echo "ping Porkbun: ${ping_status}"
case "${ping_status}" in *SUCCESS*|*yourIp*) ;; *) echo "ERRO: credenciais Porkbun inválidas"; exit 1;; esac

for sub in ${SUBS}; do
  echo "==> ${sub}.${DOMAIN} A ${IP}"
  # remove registros A existentes desse nome (idempotência) e recria
  pb "dns/deleteByNameType/${DOMAIN}/A/${sub}" >/dev/null || true
  resp="$(pb "dns/create/${DOMAIN}" "\"name\":\"${sub}\",\"type\":\"A\",\"content\":\"${IP}\",\"ttl\":\"${TTL}\"")"
  st="$(echo "${resp}" | { command -v jq >/dev/null && jq -r .status || cat; })"
  echo "   ${st}"
  case "${st}" in *SUCCESS*) ;; *) echo "   FALHA: ${resp}"; exit 1;; esac
done

echo
echo "OK. Registros A criados:"
for sub in ${SUBS}; do echo "   ${sub}.${DOMAIN} -> ${IP}"; done
echo "O certificado gerenciado fica ACTIVE em alguns minutos após a propagação."
