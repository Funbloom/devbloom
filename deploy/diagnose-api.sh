#!/usr/bin/env bash
# Run on EC2 (SSH) when https://your-domain/api/... returns 502 Bad Gateway.
# Usage: bash deploy/diagnose-api.sh   OR   chmod +x deploy/diagnose-api.sh && ./deploy/diagnose-api.sh

set +e

API_UNIT="devbloom-api"
if systemctl cat devbloom-api.service &>/dev/null; then
  API_UNIT="devbloom-api"
elif systemctl cat gamedev-api.service &>/dev/null; then
  API_UNIT="gamedev-api"
  echo "(Using legacy systemd unit gamedev-api; install deploy/devbloom-api.service.example to migrate.)"
  echo ""
fi

echo "=== ${API_UNIT} (systemd) ==="
if systemctl cat "${API_UNIT}.service" &>/dev/null; then
  systemctl is-active "${API_UNIT}"
  systemctl --no-pager -l status "${API_UNIT}" 2>&1 | head -30
else
  echo "Unit devbloom-api.service not found (nor legacy gamedev-api). Install deploy/devbloom-api.service.example first."
fi

echo ""
echo "=== TCP 127.0.0.1:8000 (API should listen here per nginx example) ==="
if command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep -E ':8000\s' || echo "Nothing listening on 8000."
else
  netstat -tlnp 2>/dev/null | grep 8000 || echo "Install iproute2 (ss) or check netstat."
fi

echo ""
echo "=== curl upstream (connection refused = API down; 200/401/404 = something answered) ==="
curl -sS -o /dev/null -w "GET /docs -> HTTP %{http_code}\n" --max-time 5 http://127.0.0.1:8000/docs || echo "curl failed"

echo ""
echo "=== Last ${API_UNIT} journal ==="
journalctl -u "${API_UNIT}" -n 50 --no-pager 2>/dev/null || true

echo ""
echo "=== nginx errors (recent) ==="
if [[ -r /var/log/nginx/error.log ]]; then
  tail -n 15 /var/log/nginx/error.log
else
  echo "Cannot read /var/log/nginx/error.log (try: sudo tail -n 30 /var/log/nginx/error.log)"
fi

echo ""
echo "If curl to :8000 fails but games/ + venv are OK, run: sudo systemctl restart ${API_UNIT}"
echo "If HTTPS returns 502 but HTTP works, check nginx listen 443 block includes location /api/ (certbot sometimes omits it)."
