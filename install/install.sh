#!/usr/bin/env bash
# install.sh — provision a fresh Raspberry Pi OS (Trixie) for the brewery controller.
# Run as the normal user (not root):  bash install/install.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="$(whoami)"
echo "== Brewery controller install =="
echo "app: $APP_DIR  user: $USER_NAME"

# ── 1. system packages ─────────────────────────────────────────
sudo apt-get update
sudo apt-get install -y git curl build-essential libgpiod-dev gpiod openssl avahi-daemon

# ── 2. Node.js 22 LTS (NodeSource) ─────────────────────────────
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "node $(node -v) / npm $(npm -v)"

# ── 3. enable SPI (MAX31865s) — GPIO char device needs no enabling ──
sudo raspi-config nonint do_spi 0 || {
  grep -q "^dtparam=spi=on" /boot/firmware/config.txt || echo "dtparam=spi=on" | sudo tee -a /boot/firmware/config.txt
}

# gpio + spi group access for the app user
sudo usermod -aG gpio,spi "$USER_NAME" || true

# ── 4. app dependencies + hardware drivers + UI build ──────────
cd "$APP_DIR"
npm install
npm run install:hardware     # node-libgpiod + spi-device (native, needs libgpiod-dev)
npm run build

# ── 5. self-signed TLS cert (phones need HTTPS for push) ───────
mkdir -p data/certs
if [[ ! -f data/certs/server.crt ]]; then
  HOST="$(hostname)"
  IP="$(hostname -I | awk '{print $1}')"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout data/certs/server.key -out data/certs/server.crt \
    -subj "/CN=brewery" \
    -addext "subjectAltName=DNS:${HOST}.local,DNS:${HOST},IP:${IP},IP:127.0.0.1"
  echo "TLS cert created for ${HOST}.local / ${IP} (valid 10 years)"
fi

# ── 6. systemd service — server starts on boot, restarts on crash ──
sudo tee /etc/systemd/system/brewery.service >/dev/null <<EOF
[Unit]
Description=Brewery controller server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/server/index.js --hardware
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable brewery

# ── 7. Chromium kiosk on boot (Wayland/labwc autostart) ────────
mkdir -p "$HOME/.config/labwc"
AUTOSTART="$HOME/.config/labwc/autostart"
touch "$AUTOSTART"
if ! grep -q "brewery-kiosk" "$AUTOSTART"; then
  cat >> "$AUTOSTART" <<'EOF'
# brewery-kiosk — touch panel on boot
chromium http://localhost:8080 --kiosk --noerrdialogs --disable-infobars \
  --no-first-run --start-maximized --check-for-update-interval=31536000 \
  --enable-features=OverlayScrollbar --touch-events=enabled \
  --disable-pinch --overscroll-history-navigation=0 &
EOF
fi

# never blank the brewery screen
mkdir -p "$HOME/.config"
if command -v raspi-config >/dev/null; then
  sudo raspi-config nonint do_blanking 1 || true   # 1 = disable blanking
fi

# boot to desktop with autologin so the kiosk comes up unattended
sudo raspi-config nonint do_boot_behaviour B4 || true

echo ""
echo "== Done =="
echo "Reboot to bring everything up:  sudo reboot"
echo "Panel:   http://$(hostname).local:8080   (kiosk opens automatically on the touchscreen)"
echo "Phone:   https://$(hostname).local:8443  (install the cert first — see docs/pi-setup.md §7)"
