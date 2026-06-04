#!/usr/bin/env bash
# Installs Google Chrome or Chromium for use with the Playwright WhatsApp adapter.
# Supports Ubuntu/Debian (any version, including 26.04).

set -e

echo "==> Detectando sistema…"

# macOS: instalar via brew
if [[ "$OSTYPE" == "darwin"* ]]; then
  if command -v brew &>/dev/null; then
    echo "==> macOS detectado — instalando Chromium via brew"
    brew install --cask chromium
  else
    echo "Instale o Homebrew primeiro: https://brew.sh"
    exit 1
  fi
  echo "Done. Chromium em: /Applications/Chromium.app"
  exit 0
fi

# Linux: tenta playwright install primeiro
echo "==> Tentando npx playwright install chromium…"
if PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright install chromium 2>/dev/null; then
  echo "==> Playwright Chromium instalado com sucesso"
  exit 0
fi

echo "==> Playwright não suporta este OS — instalando Google Chrome via apt"

# Verificar se já está instalado
if command -v google-chrome-stable &>/dev/null || command -v google-chrome &>/dev/null; then
  echo "==> Google Chrome já instalado"
  CHROME_BIN=$(command -v google-chrome-stable || command -v google-chrome)
  grep -v "^WA_CHROMIUM_PATH" .env > /tmp/.env.tmp 2>/dev/null && mv /tmp/.env.tmp .env || true
  echo "WA_CHROMIUM_PATH=$CHROME_BIN" >> .env
  echo "==> Pronto! Execute: npm run connect"
  exit 0
fi

# Google Chrome .deb (funciona em qualquer Ubuntu/Debian)
CHROME_DEB=$(mktemp --suffix=.deb)
echo "==> Baixando Google Chrome…"
DOWNLOADER=""
if command -v curl &>/dev/null; then
  DOWNLOADER="curl -fsSL"
elif command -v wget &>/dev/null; then
  DOWNLOADER="wget -q -O"
else
  echo "ERRO: instale curl ou wget primeiro: sudo apt install curl"
  exit 1
fi
$DOWNLOADER "$CHROME_DEB" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"

echo "==> Instalando…"
sudo dpkg -i "$CHROME_DEB" 2>/dev/null || true
sudo apt-get install -f -y -q

rm -f "$CHROME_DEB"

CHROME_BIN=$(command -v google-chrome-stable || command -v google-chrome || true)
if [[ -n "$CHROME_BIN" ]]; then
  echo ""
  echo "==> Google Chrome instalado: $CHROME_BIN"
  echo "==> Adicionando WA_CHROMIUM_PATH ao .env…"
  # Remove linha existente se houver, depois adiciona
  grep -v "^WA_CHROMIUM_PATH" .env > /tmp/.env.tmp 2>/dev/null && mv /tmp/.env.tmp .env || true
  echo "WA_CHROMIUM_PATH=$CHROME_BIN" >> .env
  echo "==> Pronto! Execute: npm run dev"
else
  echo "ERRO: Google Chrome não encontrado após instalação"
  exit 1
fi
