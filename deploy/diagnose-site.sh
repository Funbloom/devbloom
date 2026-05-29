#!/usr/bin/env bash
# Run on EC2 when devbloom-api / devbloom-web are green but the public site is down.
# Usage: bash deploy/diagnose-site.sh

set +e

echo "=== systemd (api, web, nginx) ==="
for unit in devbloom-api devbloom-web nginx; do
  if systemctl cat "${unit}.service" &>/dev/null; then
    printf "%s: " "${unit}"
    systemctl is-active "${unit}" 2>/dev/null || echo "unknown"
  else
    echo "${unit}: unit not installed"
  fi
done

echo ""
echo "=== listeners (80, 443, 3000, 8000) ==="
if command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep -E ':80\s|:443\s|:3000\s|:8000\s' || echo "None of 80/443/3000/8000 are listening."
else
  netstat -tlnp 2>/dev/null | grep -E '80|443|3000|8000' || true
fi

echo ""
echo "=== curl upstream (web :3000, api :8000) ==="
curl -sS -o /dev/null -w "GET http://127.0.0.1:3000/ -> HTTP %{http_code}\n" --max-time 5 http://127.0.0.1:3000/ || echo "web curl failed"
curl -sS -o /dev/null -w "GET http://127.0.0.1:8000/docs -> HTTP %{http_code}\n" --max-time 5 http://127.0.0.1:8000/docs || echo "api curl failed"

echo ""
echo "=== curl via nginx (localhost) ==="
curl -sS -o /dev/null -w "GET http://127.0.0.1/ (Host: dev.funbloomstudio.com) -> HTTP %{http_code}\n" --max-time 5 \
  -H "Host: dev.funbloomstudio.com" http://127.0.0.1/ || echo "nginx curl failed (nginx down or no config?)"

echo ""
echo "=== nginx config ==="
if [[ -f /etc/nginx/conf.d/devbloom.conf ]]; then
  echo "Found /etc/nginx/conf.d/devbloom.conf"
  grep -E 'listen|server_name|proxy_pass|location' /etc/nginx/conf.d/devbloom.conf 2>/dev/null | head -40
else
  echo "MISSING /etc/nginx/conf.d/devbloom.conf"
  echo "Copy: sudo cp /home/ec2-user/github/devbloom/deploy/nginx-devbloom-dev.conf.example /etc/nginx/conf.d/devbloom.conf"
fi

echo ""
echo "=== nginx -t ==="
sudo nginx -t 2>&1

echo ""
echo "=== recent nginx errors ==="
sudo tail -n 20 /var/log/nginx/error.log 2>/dev/null || echo "(no error log)"

echo ""
echo "--- Typical fixes ---"
echo "1. No nginx config: sudo cp .../deploy/nginx-devbloom-dev.conf.example /etc/nginx/conf.d/devbloom.conf"
echo "2. nginx inactive:   sudo nginx -t && sudo systemctl enable --now nginx"
echo "3. Upstream OK but site down externally: check EC2 security group allows inbound TCP 80 and 443"
echo "4. HTTP works, HTTPS not: sudo certbot --nginx -d dev.funbloomstudio.com"
