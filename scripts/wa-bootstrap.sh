#!/usr/bin/env bash
# Bootstrap do WhatsApp — rode DEPOIS de liberar a rede no environment
# (Network access > Custom, com web.whatsapp.com / *.whatsapp.net).
#
# Uso:  bash scripts/wa-bootstrap.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/4] Verificando acesso de rede ao WhatsApp Web…"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://web.whatsapp.com 2>/dev/null || echo 000)
if [ "$code" = "403" ] || [ "$code" = "000" ]; then
  echo "  ✗ web.whatsapp.com inacessível (HTTP $code)."
  echo "    Libere a rede no environment: Network access > Custom, adicione"
  echo "    web.whatsapp.com, *.whatsapp.com, *.whatsapp.net (marque 'include defaults')"
  echo "    e inicie uma sessão NOVA. Depois rode este script de novo."
  exit 1
fi
echo "  ✓ web.whatsapp.com acessível (HTTP $code)"

echo "[2/4] Dependências Node…"
[ -d node_modules ] || npm install --no-audit --no-fund

echo "[3/4] Chromium (Playwright)…"
npx --yes playwright install chromium || \
  echo "  aviso: usando o Chromium da imagem (defina WA_CHROMIUM_PATH se necessário)."

echo "[4/4] Conectando ao WhatsApp — escaneie o QR que aparecer"
echo "       (WhatsApp > Aparelhos conectados > Conectar um aparelho)…"
WA_ADAPTER=playwright npm run connect

echo
echo "✓ Conectado. Para subir o agente nos grupos autorizados:"
echo "    WA_AGENT_GROUPS=\"financeiro setup,projetos setup\" \\"
echo "    WA_BLOCKED_GROUPS=financasfacil \\"
echo "    ANTHROPIC_API_KEY=sk-ant-... npm run agent"
