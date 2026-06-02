#!/usr/bin/env bash
# Starts Xvfb virtual display (if not running) and launches the Computer Use MCP server.
set -e

DISPLAY_NUM="${DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"

# Start Xvfb if not already running
if ! xdpyinfo -display "$DISPLAY" &>/dev/null; then
  echo "[computer-use] Starting Xvfb on DISPLAY=$DISPLAY (1280x720x24)" >&2
  Xvfb "$DISPLAY" -screen 0 1280x720x24 -ac &
  XVFB_PID=$!
  echo "[computer-use] Xvfb PID=$XVFB_PID" >&2
  # Wait for Xvfb to be ready
  for i in $(seq 1 20); do
    xdpyinfo -display "$DISPLAY" &>/dev/null && break
    sleep 0.2
  done
fi

echo "[computer-use] Using DISPLAY=$DISPLAY" >&2

# Set a window manager so apps can open windows (optional)
# openbox --display "$DISPLAY" &>/dev/null &

# Launch the MCP server
exec tsx "$(dirname "$0")/server.ts"
