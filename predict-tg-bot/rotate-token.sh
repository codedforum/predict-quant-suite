#!/bin/bash
# Run this on the VPS after getting a real token from @BotFather.
# Usage: bash rotate-token.sh '1234567890:AAH...real-35-chars'
set -e
if [ -z "$1" ]; then
  echo "usage: bash rotate-token.sh '<BOTFATHER_TOKEN>'"
  echo "  format: <9-12 digit id>:<35 char hash>"
  exit 1
fi
TOKEN="$1"
ENV_FILE=/root/predict-quant-suite/predict-tg-bot/.env

# Validate format before touching anything
if ! [[ "$TOKEN" =~ ^[0-9]{8,12}:[A-Za-z0-9_-]{30,40}$ ]]; then
  echo "error: token does not look like a real BotFather token (id:hash)"
  exit 2
fi

# Verify it's a live bot via Telegram getMe before saving
echo "Verifying token with Telegram getMe..."
resp=$(curl -s -m 5 "https://api.telegram.org/bot${TOKEN}/getMe")
if ! echo "$resp" | grep -q '"ok":true'; then
  echo "error: Telegram rejected this token: $resp"
  exit 3
fi
bot_name=$(echo "$resp" | sed -E 's/.*"username":"([^"]+)".*/\1/')
echo "  token valid, belongs to @$bot_name"

# Back up + update
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
sed -i "s|^TG_TOKEN=.*|TG_TOKEN=$TOKEN|" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "  $ENV_FILE updated, chmod 600"

# Restart with new env
pm2 restart predict-tg-bot --update-env
sleep 4
echo
echo "Recent out log:"
tail -8 /root/.pm2/logs/predict-tg-bot-out.log
echo
echo "Recent err log (should be empty):"
tail -4 /root/.pm2/logs/predict-tg-bot-error.log
echo
echo "Bot is live at https://t.me/$bot_name"
