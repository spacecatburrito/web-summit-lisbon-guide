#!/usr/bin/env bash
# Runs as root via sudo. Idempotent. Source tree is rsynced to /home/elena-ops/deploy/ws26 first (push.sh).
set -euo pipefail
SRC=/home/elena-ops/deploy/ws26
DST=/srv/ws26
id ws26 >/dev/null 2>&1 || useradd --system --home-dir "$DST" --shell /usr/sbin/nologin ws26
mkdir -p "$DST/app" "$DST/public" "$DST/data"
rsync -a --no-owner --no-group --delete --exclude .venv --exclude __pycache__ --exclude '*.db' "$SRC/app/" "$DST/app/app/"
rsync -a --no-owner --no-group "$SRC/pyproject.toml" "$DST/app/pyproject.toml"
rsync -a --no-owner --no-group --delete --exclude data "$SRC/public/" "$DST/public/"
rsync -a --no-owner --no-group --delete --exclude '*.db' --exclude schema.md --exclude raw "$SRC/data/" "$DST/public/data/"
if [ ! -x "$DST/.venv/bin/python" ]; then python3 -m venv "$DST/.venv"; fi
"$DST/.venv/bin/pip" install -q --upgrade pip >/dev/null
"$DST/.venv/bin/pip" install -q "$DST/app"
if [ ! -f "$DST/.env" ]; then
  {
    echo "PUBLIC_BASE_URL=https://tss.wtf/ws26"
    echo "WS26_DB_PATH=$DST/data/leads.db"
    echo "WS26_EVENTS_PATH=$DST/public/data/events.json"
    echo "WS26_TIPS_PATH=$DST/public/data/tips.json"
    echo "SMTP_FROM_NAME=Elena, WS26 guide"
    if [ -f /var/lib/tss-crm/.env ]; then
      grep -E '^SMTP_(HOST|PORT|USER|PASSWORD|FROM_EMAIL)=' /var/lib/tss-crm/.env || true
      echo "# SMTP copied from tss-crm env on $(date -I)"
    else
      echo "# SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASSWORD= SMTP_FROM_EMAIL=   (not configured)"
    fi
    echo "TELEGRAM_BOT_TOKEN="
    echo "TELEGRAM_BOT_USERNAME=ws26guide_bot"
  } > "$DST/.env"
  echo "created $DST/.env"
fi
grep -q '^ANTHROPIC_API_KEY=' "$DST/.env" || printf '%s\n' "# Claude key for the 'Describe it in words' mode; empty = keyword fallback" "ANTHROPIC_API_KEY=" "WS26_PARSE_MODEL=claude-sonnet-5-5" >> "$DST/.env"
chown -R ws26:ws26 "$DST/data" "$DST/.env"
chmod 600 "$DST/.env"
chown -R root:root "$DST/app" "$DST/public" "$DST/.venv"
chmod -R a+rX "$DST/public" "$DST/app"
install -m 644 "$SRC/deploy/ws26.service" /etc/systemd/system/ws26.service
if ! grep -q 'handle_path /ws26/\*' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
  python3 - "$SRC/deploy/caddy-snippet.txt" <<'PY'
import re, sys
snippet = open(sys.argv[1]).read()
path = "/etc/caddy/Caddyfile"
s = open(path).read()
marker = "\thandle_path /lena* {"
i = s.index(marker)
# only inside the tss.wtf block (the second occurrence set belongs to apex)
s = s[:i] + snippet + "\n" + s[i:]
open(path, "w").write(s)
PY
  caddy validate --config /etc/caddy/Caddyfile >/dev/null
  systemctl reload caddy
  echo "caddy updated"
fi
if ! grep -q 'handle_path /ws/\*' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
  python3 - "$SRC/deploy/caddy-snippet-ws.txt" <<'PY'
import sys
snippet = open(sys.argv[1]).read()
path = "/etc/caddy/Caddyfile"
s = open(path).read()
marker = "\thandle_path /lena* {"
i = s.index(marker)
s = s[:i] + snippet + "\n" + s[i:]
open(path, "w").write(s)
PY
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null; then
    systemctl reload caddy
    echo "caddy updated: /ws"
  else
    cp "$(ls -t /etc/caddy/Caddyfile.bak-* | head -1)" /etc/caddy/Caddyfile
    echo "caddy /ws route invalid, Caddyfile restored" >&2
    exit 1
  fi
fi
systemctl daemon-reload
systemctl enable -q ws26
systemctl restart ws26
sleep 1
systemctl is-active ws26
grep -cE '^SMTP_HOST=.+' "$DST/.env" | sed 's/^/smtp_host_set=/' || true
grep -cE '^TELEGRAM_BOT_TOKEN=.+' "$DST/.env" | sed 's/^/tg_token_set=/' || true
grep -cE '^ANTHROPIC_API_KEY=.+' "$DST/.env" | sed 's/^/anthropic_key_set=/' || true
curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:8006/api/health
