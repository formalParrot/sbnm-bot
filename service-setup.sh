#!/bin/bash
# Sets up the sbnm systemd service and cron-based auto-update on Ubuntu.
# Run as root: sudo bash service-setup.sh

set -e

BOT_DIR="/root/SBnM-bot"
SERVICE_NAME="sbnm"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_BIN="$(which node)"

echo "[setup] Using node: $NODE_BIN"
echo "[setup] Bot directory: $BOT_DIR"

# --- 1. Create the systemd service file ---
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=SBnM Discord Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${BOT_DIR}
ExecStart=${NODE_BIN} ${BOT_DIR}/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "[setup] Wrote $SERVICE_FILE"

# --- 2. Enable and start the service ---
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
echo "[setup] Service enabled and started"

# --- 3. Install the cron job for update.sh ---
UPDATE_SCRIPT="${BOT_DIR}/update.sh"
CRON_LINE="* * * * * ${UPDATE_SCRIPT} >> ${BOT_DIR}/update.log 2>&1"

chmod +x "$UPDATE_SCRIPT"

# Add only if not already present
if crontab -l 2>/dev/null | grep -qF "$UPDATE_SCRIPT"; then
  echo "[setup] Cron entry already exists — skipping"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "[setup] Cron entry added"
fi

echo ""
echo "[setup] Done. Check status with: systemctl status $SERVICE_NAME"
echo "[setup] View logs with:          journalctl -u $SERVICE_NAME -f"
