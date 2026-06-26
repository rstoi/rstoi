#!/usr/bin/env bash
#
# openclaw-setup.sh — instala, configura e testa o OpenClaw (Peter Steinberger)
# de forma não-interativa e idempotente.
#
# OpenClaw é um agente de IA autônomo que conversa por canais de mensagem
# (WhatsApp, Telegram, Discord, etc.) através de um Gateway local.
# Docs: https://docs.openclaw.ai  ·  Repo: https://github.com/openclaw/openclaw
#
# Requisitos: Node 24 (recomendado) ou Node >= 22.19.
#
# Uso:
#   bash scripts/openclaw-setup.sh                 # instala + configura + testa
#   OPENCLAW_PORT=18789 bash scripts/openclaw-setup.sh
#
set -euo pipefail

PORT="${OPENCLAW_PORT:-18789}"
LOG_DIR="${TMPDIR:-/tmp}/openclaw-setup"
mkdir -p "$LOG_DIR"
GATEWAY_LOG="$LOG_DIR/gateway.log"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ── 0. Pré-requisitos ────────────────────────────────────────────────────────
say "Verificando Node.js"
node --version
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  echo "ERRO: OpenClaw requer Node 24 (recomendado) ou >= 22.19." >&2
  exit 1
fi

# ── 1. Instalação ────────────────────────────────────────────────────────────
say "Instalando openclaw@latest globalmente (npm -g)"
npm install -g openclaw@latest
openclaw --version

# ── 2. Configuração base (não-interativa) ────────────────────────────────────
say "Criando config, workspace e diretórios de sessão (openclaw setup)"
openclaw setup

say "Aplicando configuração não-interativa"
# Memory search usa OpenAI por padrão; desligamos se não houver OPENAI_API_KEY.
if [ -z "${OPENAI_API_KEY:-}" ]; then
  openclaw config set agents.defaults.memorySearch.enabled false
fi

# Auth do Gateway por token (recomendado, inclusive em loopback).
if [ -z "$(openclaw config get gateway.auth.token 2>/dev/null | tail -1 | tr -d '[:space:]')" ]; then
  TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  openclaw config set gateway.auth.mode token
  openclaw config set gateway.auth.token "$TOKEN"
fi

say "Validando configuração"
openclaw config validate

# ── 3. Teste: sobe o Gateway em foreground e consulta status/health ──────────
# Em container, rode o Gateway em foreground (não há systemd user service).
say "Subindo o Gateway em background (porta $PORT)"
openclaw gateway run --force --port "$PORT" > "$GATEWAY_LOG" 2>&1 &
GATEWAY_PID=$!
trap 'kill "$GATEWAY_PID" 2>/dev/null || true' EXIT

# Espera o Gateway ficar pronto.
for _ in $(seq 1 60); do
  grep -qi "ready" "$GATEWAY_LOG" && break
  sleep 0.5
done
grep -qi "ready" "$GATEWAY_LOG" || { echo "Gateway não ficou pronto:"; tail -40 "$GATEWAY_LOG"; exit 1; }

TOKEN="$(openclaw config get gateway.auth.token 2>/dev/null | tail -1 | tr -d '[:space:]')"

say "openclaw status"
openclaw status --token "$TOKEN"

say "openclaw health"
openclaw health --token "$TOKEN"

say "openclaw doctor (resumo)"
openclaw doctor | grep -iE "Loaded:|Errors:|Memory search|Gateway auth" || true

cat <<EOF

------------------------------------------------------------------------------
OpenClaw instalado, configurado e testado. ✔

Próximos passos (requerem credenciais suas):
  1. Modelo/LLM:   openclaw configure --section model
                   (ou export OPENAI_API_KEY / ANTHROPIC_API_KEY)
  2. Canal:        openclaw channels add        # WhatsApp/Telegram/Discord
  3. Dono (owner): openclaw config set commands.ownerAllowFrom '["telegram:SEU_ID"]'
  4. Rodar agente: openclaw agent --message "checklist" --token <token>

Config: ~/.openclaw/openclaw.json
Logs do teste: $GATEWAY_LOG
------------------------------------------------------------------------------
EOF
