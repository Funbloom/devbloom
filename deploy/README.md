# Deploy examples (EC2 + nginx + HTTPS)

Use these with the main README’s **EC2 / Production** section.

- **nginx-gamedevking.conf.example** — Generic template; replace `yourdomain.com` with your domain.

- **nginx-gamedevking-dev.conf.example** — Ready for **dev.funbloomstudio.com** (A record → EC2). Copy to `/etc/nginx/conf.d/gamedevking.conf`, run `sudo nginx -t`, then **start** nginx if needed: `sudo systemctl start nginx` (or `sudo systemctl enable --now nginx` to start and enable on boot). For later config changes use `sudo systemctl reload nginx`. HTTPS: `sudo certbot --nginx -d dev.funbloomstudio.com`.

- **gamedev-api.service.example** — Copy to `/etc/systemd/system/gamedev-api.service`. Set `WorkingDirectory`, `EnvironmentFile`, and `ExecStart` to your app path (e.g. `/home/ec2-user/gamedev-king/api`). Then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-api`.

- **gamedev-web.service.example** — Copy to `/etc/systemd/system/gamedev-web.service`. Set `WorkingDirectory` and `NEXT_PUBLIC_API_URL_BASE` to your API URL. Then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-web`.

Replace `/home/ec2-user/gamedev-king` and `ec2-user` if your app lives elsewhere or runs as another user.

### Deploy from S3 (no build on EC2)

- **build-and-upload.bat** (run on Windows from repo root or `deploy/`): builds web (Next.js standalone), zips web + api, uploads to `s3://devbloom/releases/` as a timestamped zip and as `latest.zip`. Requires AWS CLI configured and `npm` in PATH.
- **ec2-deploy.sh** (run on EC2): downloads `latest.zip` (or a given key) from that bucket, extracts into `APP_ROOT` (default `/home/ec2-user/gamedev-king`), restores existing `api/.env`, installs API Python deps, restarts `gamedev-api` and `gamedev-web`. Prereqs: AWS CLI (or instance role), `unzip`, `rsync`, Node, Python 3 + venv.
- **gamedev-web-standalone.service.example** — Use this for the web service when deploying via S3 (standalone build). It runs `node server.js` instead of `npm start`. Copy over `gamedev-web.service` and run `sudo systemctl daemon-reload && sudo systemctl restart gamedev-web`.

**If you get "Bad message"** when enabling the service, the unit file likely has Windows line endings. On the EC2 box run: `sudo sed -i 's/\r$//' /etc/systemd/system/gamedev-api.service` then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-api`.

## Common commands (EC2)

**Check status**
- **nginx**: `sudo systemctl status nginx`
- **API**: `sudo systemctl status gamedev-api`
- **web**: `sudo systemctl status gamedev-web`

**Start**
- **nginx**: `sudo systemctl start nginx`
- **API**: `sudo systemctl start gamedev-api`
- **web**: `sudo systemctl start gamedev-web`

**Stop**
- **nginx**: `sudo systemctl stop nginx`
- **API**: `sudo systemctl stop gamedev-api`
- **web**: `sudo systemctl stop gamedev-web`

**Restart**
-  'sudo systemctl daemon-reload'
- **nginx**: `sudo systemctl restart nginx`
- **API**: `sudo systemctl restart gamedev-api`
- **web**: `sudo systemctl restart gamedev-web`

**View logs**
- **API**: `sudo journalctl -u gamedev-api -n 50 --no-pager`
- **web**: `sudo journalctl -u gamedev-web -n 50 --no-pager`

## SSH into the EC2 server

- **With key file explicitly**  
  `ssh -i .\Oregon_DevBloom.pem ec2-user@dev.funbloomstudio.com`

- **Using public DNS name instead of domain**  
  `ssh -i /path/to/your-key.pem ec2-user@ec2-XX-XX-XX-XX.us-west-2.compute.amazonaws.com`

Replace `/path/to/your-key.pem` with your actual key path, and `ec2-user` only if your instance uses a different default user.

