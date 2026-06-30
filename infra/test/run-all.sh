#!/usr/bin/env bash
# Roda toda a bateria de testes da plataforma (acesso + Claude + serviços),
# localmente, sem GCP. Imprime um resumo e sai !=0 se algo falhar.
#
# Requisitos (instalados pelo startup.sh em produção; aqui localmente):
#   Xvfb fluxbox x11vnc novnc websockify scrot xdotool ttyd code-server
#   node>=20, chromium (Playwright), node_modules do projeto.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export PATH=/opt/node22/bin:$PATH
total_fail=0
run(){ echo; echo "######## $1 ########"; bash -c "$2"; rc=$?; total_fail=$((total_fail+rc)); echo "## $1 -> exit $rc"; }

# 1) pilha de acesso (display, CLI/tmux, ttyd, noVNC, code-server, chromium)
run "ACESSO (desktop remoto + CLI + editor)" "bash '$HERE/access-stack.sh'"
# 2) computer-use MCP (as mãos do Claude)
run "COMPUTER-USE MCP"                        "bash '$HERE/run-computer-use.sh'"
# 3) serviço de controle / wake
run "CONTROLE / WAKE"                         "node '$HERE/control-smoke.mjs'"
# 4) automação DNS no Porkbun
run "PORKBUN DNS"                             "node '$HERE/porkbun-smoke.mjs'"

echo; echo "==================================================="
[ "$total_fail" -eq 0 ] && echo "TODOS OS TESTES PASSARAM ✅" || echo "FALHAS: $total_fail ❌"
echo "==================================================="
exit $total_fail
