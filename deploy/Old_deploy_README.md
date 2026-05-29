# Deploy examples (EC2 + nginx + HTTPS)

Use these with the main README’s **EC2 / Production** section.

- **nginx-devbloom.conf.example** — Generic template; replace `yourdomain.com` with your domain.

- **nginx-devbloom-dev.conf.example** — Ready for **dev.funbloomstudio.com** (A record → EC2). Copy to `/etc/nginx/conf.d/devbloom.conf`, run `sudo nginx -t`, then **start** nginx if needed: `sudo systemctl start nginx` (or `sudo systemctl enable --now nginx` to start and enable on boot). For later config changes use `sudo systemctl reload nginx`. HTTPS: `sudo certbot --nginx -d dev.funbloomstudio.com`.

- **devbloom-api.service.example** — Copy to `/etc/systemd/system/devbloom-api.service`. Set `WorkingDirectory`, `EnvironmentFile`, and `ExecStart` to your app path (e.g. `/home/ec2-user/devbloom/api`). Then `sudo systemctl daemon-reload && sudo systemctl enable --now devbloom-api`.

- **devbloom-web.service.example** — Copy to `/etc/systemd/system/devbloom-web.service`. Set `WorkingDirectory` and `NEXT_PUBLIC_API_URL_BASE` to your API URL. Then `sudo systemctl daemon-reload && sudo systemctl enable --now devbloom-web`.

Replace `/home/ec2-user/devbloom` and `ec2-user` if your app lives elsewhere or runs as another user.

**Migrating from older deploys:** If you still use systemd units named `gamedev-api` / `gamedev-web`, either install the new unit files above (recommended) or set `RESTART_SERVICES=0` when running `ec2-deploy.sh` and restart your existing units manually.

### Deploy from S3 (no build on EC2)

- **build-and-upload.bat** (run on Windows, from repo root via `deploy\build-and-upload.bat`): builds web (Next.js standalone), stages **`web/`**, **`api/`**, and **`games/`** into `deploy/staging/devbloom/`, zips that tree (top folder **`devbloom/`**), uploads to S3 as a timestamped zip and as **`latest.zip`**. The **`games/`** tree (e.g. `manifest.json`, `pocket_voyager`) is required at runtime: the API imports `games.*` and reads `games/manifest.json` next to `api/`. Requires [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and `npm` in PATH. Use `aws configure` (access keys) or SSO; optional **`AWS_PROFILE`** selects the profile. Optional overrides before running the batch file (same `cmd` session): `set S3_BUCKET=...`, `set S3_PREFIX=releases`, `set PRODUCTION_API_URL=https://your-domain/api` (baked into the Next.js client).
- **ec2-deploy.sh** (run on EC2): downloads the zip from S3, `rsync`s **`web/`**, **`api/`**, and **`games/`** into `APP_ROOT`, restores `api/.env`, recreates/updates the API venv and `pip install -r requirements.txt`, runs **`systemctl daemon-reload`** and restarts **`devbloom-api`** and **`devbloom-web`**. Accepts legacy zips whose top folder is still **`gamedev-king/`**. Environment overrides: `APP_ROOT`, `S3_BUCKET`, `S3_PREFIX`, `RESTART_SERVICES=0` to skip restarts. See **Get zip from S3 and deploy** below.
- **devbloom-web-standalone.service.example** — Use this for the web service when deploying via S3. It runs `node server.js` instead of `npm start`. Copy to `/etc/systemd/system/devbloom-web.service` and run `sudo systemctl daemon-reload && sudo systemctl restart devbloom-web`.

### Get zip from S3 and deploy (on EC2)

Prereqs on the instance: AWS CLI (or IAM instance role with S3 read), `unzip`, `rsync`, Node.js, **Python 3.10+** (API dependency `mcp` requires it). The app must already exist at `APP_ROOT` (e.g. first deploy: clone the repo or create the directory and put `api/.env` in place). On Amazon Linux 2, install Python 3.11 if needed: `sudo dnf install python3.11`.

**1. SSH into EC2**

```bash
ssh -i .\Oregon_DevBloom.pem ec2-user@dev.funbloomstudio.com
```

**2. Go to the app directory**

```bash
cd /home/ec2-user/devbloom
```

(If your app is elsewhere, set `APP_ROOT` when running the script in step 4.)

**3. Ensure the deploy script is there**

If you deploy from git, pull so `deploy/ec2-deploy.sh` exists. If you copied the repo once, the script should already be at `deploy/ec2-deploy.sh`.

**4. Download the zip from S3 and deploy**

Deploy the latest build (what you uploaded with `build-and-upload.bat`):

```bash
chmod +x deploy/ec2-deploy.sh
./deploy/ec2-deploy.sh
```

The script will: download from `s3://devbloom/releases/latest.zip` (or the given key), extract, sync `web/`, `api/`, and `games/` into `/home/ec2-user/devbloom`, keep existing `api/.env`, run `pip install -r requirements.txt` in the API venv, run `daemon-reload`, and restart `devbloom-api` and `devbloom-web`.

**5. Check services**

```bash
sudo systemctl status devbloom-api devbloom-web
```

To use a different app root (e.g. `/opt/devbloom`):

```bash
APP_ROOT=/opt/devbloom ./deploy/ec2-deploy.sh
```

**If you get "Bad message"** when enabling the service, the unit file likely has Windows line endings. On the EC2 box run: `sudo sed -i 's/\r$//' /etc/systemd/system/devbloom-api.service` then `sudo systemctl daemon-reload && sudo systemctl enable --now devbloom-api`.

## Common commands (EC2)

**Check status**
- **nginx**: `sudo systemctl status nginx`
- **API**: `sudo systemctl status devbloom-api`
- **web**: `sudo systemctl status devbloom-web`

**Start**
- **nginx**: `sudo systemctl start nginx`
- **API**: `sudo systemctl start devbloom-api`
- **web**: `sudo systemctl start devbloom-web`

**Stop**
- **nginx**: `sudo systemctl stop nginx`
- **API**: `sudo systemctl stop devbloom-api`
- **web**: `sudo systemctl stop devbloom-web`

**Restart**
- **reload units**: `sudo systemctl daemon-reload`
- **nginx**: `sudo systemctl restart nginx`
- **API**: `sudo systemctl restart devbloom-api`
- **web**: `sudo systemctl restart devbloom-web`

**View logs**
- **API**: `sudo journalctl -u devbloom-api -n 50 --no-pager`
- **web**: `sudo journalctl -u devbloom-web -n 50 --no-pager`

## SSH into the EC2 server

- **With key file explicitly**  
  `ssh -i .\Oregon_DevBloom.pem ec2-user@dev.funbloomstudio.com`

- **Using public DNS name instead of domain**  
  `ssh -i /path/to/your-key.pem ec2-user@ec2-XX-XX-XX-XX.us-west-2.compute.amazonaws.com`

Replace `/path/to/your-key.pem` with your actual key path, and `ec2-user` only if your instance uses a different default user.

## 502 Bad Gateway on `/api/...`

The browser talks to **nginx**; nginx proxies `/api/` to **FastAPI on `127.0.0.1:8000`** (see `nginx-devbloom-dev.conf.example`). A **502** means nginx could not get a valid HTTP response from that upstream.

**On the EC2 instance, run:**

```bash
bash deploy/diagnose-api.sh
```

Or manually:

1. **`sudo systemctl status devbloom-api`** — must be **active (running)**. If **failed**, see logs: `sudo journalctl -u devbloom-api -n 80 --no-pager` (common: missing `api/.env`, Python import error, missing `games/` next to `api/`, bad venv).
2. **`curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/docs`** — should print **200** (or at least connect). **Connection refused** → API not listening; fix the service first.
3. **HTTPS only 502** — after **certbot**, open `/etc/nginx/conf.d/devbloom.conf` (or your vhost). The **`server { listen 443 ssl; ... }`** block must include **`location /api/`** with **`proxy_pass http://127.0.0.1:8000/;`** the same way as port 80. If `/api/` is missing on 443, requests to `https://…/api/auth/me` can return 502. Then: `sudo nginx -t && sudo systemctl reload nginx`.

