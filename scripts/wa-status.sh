#!/usr/bin/env bash
# Status dos agentes de WhatsApp + comandos /setup pendentes.
# Uso:  npm run wa:status   (ou: bash scripts/wa-status.sh)
set -uo pipefail
cd "$(dirname "$0")/.."

echo "════════════════════════════════════════════════"
echo "  Status dos agentes WhatsApp — setup.com.br"
echo "════════════════════════════════════════════════"

echo
echo "[Rede]"
wa=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://web.whatsapp.com 2>/dev/null || echo 000)
if [ "$wa" = "200" ]; then
  echo "  web.whatsapp.com: $wa — acessível ✓"
else
  echo "  web.whatsapp.com: $wa — bloqueado/indisponível (login impossível nesta sessão)"
fi

echo
echo "[Processos]"
pgrep -f "src/index.ts"        >/dev/null 2>&1 && echo "  MCP WhatsApp (src/index.ts): rodando ✓" || echo "  MCP WhatsApp: parado"
pgrep -f "scripts/wa-agent"    >/dev/null 2>&1 && echo "  Agente /setup (wa-agent): rodando ✓"     || echo "  Agente /setup: parado"
pgrep -f "computer-use/server" >/dev/null 2>&1 && echo "  computer-use MCP: rodando ✓"             || echo "  computer-use MCP: parado"

echo
echo "[Sessão WhatsApp / login]"
if [ -d data/wa-session ] && [ -n "$(ls -A data/wa-session 2>/dev/null)" ]; then
  echo "  sessão/login: presente ✓"
else
  echo "  sessão/login: ausente — rode 'npm run connect' (após liberar a rede)"
fi

echo
echo "[Configuração]"
echo "  WA_AGENT_GROUPS:       ${WA_AGENT_GROUPS:-<vazio> (ver .env)}"
echo "  WA_BLOCKED_GROUPS:     ${WA_BLOCKED_GROUPS:-<vazio> (ver .env)}"
echo "  WA_AGENT_ALLOWED_SENDERS: ${WA_AGENT_ALLOWED_SENDERS:-<vazio> = qualquer membro dos grupos}"

echo
echo "[Comandos /setup pendentes]"
python3 - <<'PY'
import glob, sqlite3
dbs = glob.glob("data/*.db")
if not dbs:
    print("  nenhum banco de mensagens encontrado → 0 pendentes")
    raise SystemExit
total = 0
for db in dbs:
    try:
        con = sqlite3.connect(db); cur = con.cursor()
        tabs = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        if "messages" not in tabs:
            con.close(); continue
        rows = cur.execute(
            "SELECT chat_id, from_id, text FROM messages "
            "WHERE text LIKE '/setup%' AND is_from_me=0 "
            "ORDER BY timestamp DESC LIMIT 30"
        ).fetchall()
        for chat, frm, txt in rows:
            total += 1
            print(f"  • [{chat}] {frm}: {(txt or '')[:80]}")
        con.close()
    except Exception as e:
        print(f"  erro lendo {db}: {e}")
print(f"  total de /setup recebidos no histórico: {total}")
print("  (sem conexão ao WhatsApp, nada é ingerido — 0 é o esperado)")
PY

echo
echo "════════════════════════════════════════════════"
