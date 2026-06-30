#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Startup script da Claude Workstation (GCE metadata startup-script).
# Idempotente: roda em todo boot. Provisiona display virtual, Chromium/Playwright,
# computer-use, code-server, terminal web (ttyd), noVNC, a sessão do Claude Code
# e o auto-stop por ociosidade. Tudo como serviços systemd que sobem sozinhos.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
exec > >(tee -a /var/log/claude-startup.log) 2>&1
echo "[startup] $(date -Is) iniciando"

APP_USER="claude"
APP_HOME="/home/${APP_USER}"
WORKSPACE="${APP_HOME}/workspace"
DISPLAY_NUM=":99"

# ── usuário não-root para rodar tudo ─────────────────────────────────────────
id -u "${APP_USER}" &>/dev/null || useradd -m -s /bin/bash "${APP_USER}"
mkdir -p "${WORKSPACE}"

# ── pacotes base (só na primeira vez) ────────────────────────────────────────
if [ ! -f /var/lib/claude-provisioned ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    curl ca-certificates git tmux jq \
    xvfb x11vnc novnc websockify fluxbox \
    scrot xdotool x11-utils \
    fonts-liberation libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2

  # Node 22
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs

  # ttyd (terminal no navegador) — binário estático oficial
  curl -fsSL -o /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64
  chmod +x /usr/local/bin/ttyd

  # code-server (VS Code no navegador)
  curl -fsSL https://code-server.dev/install.sh | sh

  # Claude Code CLI + Playwright/Chromium (como o usuário claude)
  sudo -u "${APP_USER}" bash -lc '
    npm config set prefix ${HOME}/.npm-global
    echo "export PATH=\$HOME/.npm-global/bin:\$PATH" >> ${HOME}/.bashrc
    export PATH=$HOME/.npm-global/bin:$PATH
    npm install -g @anthropic-ai/claude-code playwright
    npx --yes playwright install chromium
  '

  touch /var/lib/claude-provisioned
fi

# ── segredos via Secret Manager ──────────────────────────────────────────────
fetch_secret() {
  curl -s -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | jq -r .access_token | { read -r TOK; \
    curl -s -H "Authorization: Bearer ${TOK}" \
      "https://secretmanager.googleapis.com/v1/projects/$(curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)/secrets/$1/versions/latest:access" \
      | jq -r '.payload.data' | base64 -d; }
}
ANTHROPIC_API_KEY="$(fetch_secret anthropic-api-key || true)"
CODE_SERVER_PASSWORD="$(fetch_secret code-server-password || echo changeme)"

install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_HOME}/.config/code-server"
cat > "${APP_HOME}/.config/code-server/config.yaml" <<EOF
bind-addr: 0.0.0.0:8080
auth: password
password: ${CODE_SERVER_PASSWORD}
cert: false
EOF
chown -R "${APP_USER}:${APP_USER}" "${APP_HOME}/.config"

# ANTHROPIC_API_KEY disponível para todos os serviços via environment file
cat > /etc/claude.env <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
DISPLAY=${DISPLAY_NUM}
PLAYWRIGHT_BROWSERS_PATH=${APP_HOME}/.cache/ms-playwright
EOF
chmod 600 /etc/claude.env

IDLE_MIN="$(curl -s -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/idle-shutdown-minutes || echo 30)"

# ─────────────────────────────────────────────────────────────────────────────
# systemd units
# ─────────────────────────────────────────────────────────────────────────────
cat > /etc/systemd/system/xvfb.service <<'EOF'
[Unit]
Description=Virtual framebuffer X server (:99)
After=network.target
[Service]
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac +extension RANDR
Restart=always
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fluxbox.service <<EOF
[Unit]
Description=Window manager no display virtual
After=xvfb.service
Requires=xvfb.service
[Service]
User=${APP_USER}
Environment=DISPLAY=${DISPLAY_NUM}
ExecStart=/usr/bin/fluxbox
Restart=always
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/x11vnc.service <<EOF
[Unit]
Description=VNC server do display virtual
After=fluxbox.service
Requires=xvfb.service
[Service]
Environment=DISPLAY=${DISPLAY_NUM}
ExecStart=/usr/bin/x11vnc -display ${DISPLAY_NUM} -forever -shared -nopw -rfbport 5900 -localhost
Restart=always
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/novnc.service <<'EOF'
[Unit]
Description=noVNC (VNC no navegador) na 6080
After=x11vnc.service
Requires=x11vnc.service
[Service]
ExecStart=/usr/bin/websockify --web /usr/share/novnc 6080 localhost:5900
Restart=always
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/claude-session.service <<EOF
[Unit]
Description=Sessao persistente do Claude Code em tmux
After=network-online.target xvfb.service
[Service]
User=${APP_USER}
WorkingDirectory=${WORKSPACE}
EnvironmentFile=/etc/claude.env
Environment=PATH=${APP_HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
# Cria (se nao existir) uma sessao tmux 'claude' rodando o CLI; permanece viva
# independentemente de ttyd/code-server estarem conectados.
ExecStart=/usr/bin/tmux new-session -d -s claude -x 220 -y 50 'claude; exec bash'
ExecStop=/usr/bin/tmux kill-session -t claude
RemainAfterExit=yes
Type=oneshot
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/ttyd.service <<EOF
[Unit]
Description=Terminal no navegador (ttyd) -> tmux claude
After=claude-session.service
[Service]
User=${APP_USER}
EnvironmentFile=/etc/claude.env
Environment=PATH=${APP_HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/ttyd -p 7681 -W tmux new-session -A -s claude
Restart=always
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/code-server.service <<EOF
[Unit]
Description=code-server (VS Code no navegador)
After=network-online.target
[Service]
User=${APP_USER}
EnvironmentFile=/etc/claude.env
ExecStart=/usr/bin/code-server
Restart=always
[Install]
WantedBy=multi-user.target
EOF

# ── auto-stop por ociosidade ─────────────────────────────────────────────────
cat > /usr/local/bin/claude-idle-monitor.sh <<EOF
#!/usr/bin/env bash
# Desliga a VM se nao houver conexao ativa nas portas de acesso por IDLE_MIN min.
set -euo pipefail
IDLE_MIN=${IDLE_MIN}
STAMP=/run/claude-last-active
active() {
  # conexoes ESTABELECIDAS no code-server(8080), ttyd(7681), noVNC(6080)
  ss -tnH state established '( sport = :8080 or sport = :7681 or sport = :6080 )' \
    | grep -q . && return 0
  return 1
}
if active; then
  date +%s > "\$STAMP"
  exit 0
fi
[ -f "\$STAMP" ] || { date +%s > "\$STAMP"; exit 0; }
LAST=\$(cat "\$STAMP"); NOW=\$(date +%s)
if [ \$(( (NOW - LAST) / 60 )) -ge "\$IDLE_MIN" ]; then
  logger -t claude-idle "ocioso ha >= \${IDLE_MIN}min; desligando"
  ZONE=\$(curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/zone | awk -F/ '{print \$NF}')
  NAME=\$(curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/name)
  gcloud compute instances stop "\$NAME" --zone "\$ZONE" --quiet
fi
EOF
chmod +x /usr/local/bin/claude-idle-monitor.sh

cat > /etc/systemd/system/claude-idle.service <<'EOF'
[Unit]
Description=Checagem de ociosidade da workstation
[Service]
Type=oneshot
ExecStart=/usr/local/bin/claude-idle-monitor.sh
EOF

cat > /etc/systemd/system/claude-idle.timer <<'EOF'
[Unit]
Description=Roda a checagem de ociosidade a cada 5 min
[Timer]
OnBootSec=10min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF

# ── habilita tudo ────────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable --now xvfb fluxbox x11vnc novnc claude-session ttyd code-server claude-idle.timer

echo "[startup] $(date -Is) concluido"
