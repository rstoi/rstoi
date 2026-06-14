#!/bin/bash
# SessionStart hook — reconstrói o ambiente a cada início de sessão.
#
# O container do Claude Code na web é efêmero: a cada reboot o repositório é
# clonado do zero e tudo que não está no Git é perdido. Este script restaura
# as dependências e a estrutura necessárias para os agentes (MCP de WhatsApp e
# computer-use) e para a geração dos documentos (docs/build_*.py).
#
# É idempotente e não-interativo. Roda apenas no ambiente remoto.
set -euo pipefail

# Só no ambiente remoto (Claude Code na web); no local, não faz nada.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Mantém o stdout do hook limpo (evita poluir o contexto); logs vão p/ stderr.
exec 1>&2

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[session-start] Dependências Node (npm install)…"
npm install --no-audit --no-fund

echo "[session-start] Dependências Python (geração de documentos)…"
python3 -m pip install --quiet --disable-pip-version-check -r requirements.txt

echo "[session-start] Diretório de dados (sessões/SQLite dos agentes)…"
mkdir -p data

# Chromium para o adaptador Playwright/WhatsApp e computer-use.
# Best-effort: não derruba a sessão se o CDN do Playwright estiver bloqueado —
# a imagem base normalmente já traz o Chromium em /opt/pw-browsers.
if ! ls /opt/pw-browsers/chromium-*/chrome-linux/chrome >/dev/null 2>&1; then
  echo "[session-start] Instalando Chromium do Playwright (best-effort)…"
  npx --yes playwright install chromium || \
    echo "[session-start] aviso: Chromium não instalado automaticamente."
fi

echo "[session-start] Ambiente pronto."
