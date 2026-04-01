#!/usr/bin/env bash
# Run on EC2 (SSH) when https://your-domain/api/... returns 502 Bad Gateway.
# Usage: bash deploy/diagnose-api.sh   OR   chmod +x deploy/diagnose-api.sh && ./deploy/diagnose-api.sh

set +e

echo "=== gamedev-api (systemd) ==="
if systemctl list-unit-files gamedev-api.service &>/dev/null; then
  systemctl is-active gamedev-api
  systemctl --no-pager -l status gamedev-api 2>&1 | head -30
else
  echo "Unit gamedev-api.service not found. Install deploy/gamedev-api.service.example first."
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
echo "=== Last gamedev-api journal ==="
journalctl -u gamedev-api -n 50 --no-pager 2>/dev/null || true

echo ""
echo "=== nginx errors (recent) ==="
if [[ -r /var/log/nginx/error.log ]]; then
  tail -n 15 /var/log/nginx/error.log
else
  echo "Cannot read /var/log/nginx/error.log (try: sudo tail -n 30 /var/log/nginx/error.log)"
fi

echo ""
echo "If curl to :8000 fails but games/ + venv are OK, run: sudo systemctl restart gamedev-api"
echo "If HTTPS returns 502 but HTTP works, check nginx listen 443 block includes location /api/ (certbot sometimes omits it)."
