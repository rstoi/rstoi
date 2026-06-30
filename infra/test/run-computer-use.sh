#!/usr/bin/env bash
# Sobe Xvfb + fluxbox, roda o smoke do MCP computer-use e derruba tudo.
set -u
REPO=/home/user/rstoi
LOG=/tmp/claude-test
mkdir -p "$LOG"
export DISPLAY=:99
export PATH=/opt/node22/bin:$PATH
PIDS=()
cleanup(){ for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done;
  pkill -f "Xvfb :99" 2>/dev/null; pkill -f fluxbox 2>/dev/null; }
trap cleanup EXIT
mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

Xvfb :99 -screen 0 1920x1080x24 -ac +extension RANDR >"$LOG/xvfb.cu.log" 2>&1 & PIDS+=($!)
for i in $(seq 1 40); do xdpyinfo -display :99 >/dev/null 2>&1 && break; sleep 0.25; done
fluxbox >"$LOG/fb.cu.log" 2>&1 & PIDS+=($!)
sleep 1

node "$REPO/infra/test/computer-use-smoke.mjs"
exit $?
