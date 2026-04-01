# Deploy examples (EC2 + nginx + HTTPS)

Use these with the main README’s **EC2 / Production** section.

- **nginx-gamedevking.conf.example** — Generic template; replace `yourdomain.com` with your domain.

- **nginx-gamedevking-dev.conf.example** — Ready for **dev.funbloomstudio.com** (A record → EC2). Copy to `/etc/nginx/conf.d/gamedevking.conf`, run `sudo nginx -t`, then **start** nginx if needed: `sudo systemctl start nginx` (or `sudo systemctl enable --now nginx` to start and enable on boot). For later config changes use `sudo systemctl reload nginx`. HTTPS: `sudo certbot --nginx -d dev.funbloomstudio.com`.

- **gamedev-api.service.example** — Copy to `/etc/systemd/system/gamedev-api.service`. Set `WorkingDirectory`, `EnvironmentFile`, and `ExecStart` to your app path (e.g. `/home/ec2-user/gamedev-king/api`). Then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-api`.

- **gamedev-web.service.example** — Copy to `/etc/systemd/system/gamedev-web.service`. Set `WorkingDirectory` and `NEXT_PUBLIC_API_URL_BASE` to your API URL. Then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-web`.

Replace `/home/ec2-user/gamedev-king` and `ec2-user` if your app lives elsewhere or runs as another user.

### Deploy from S3 (no build on EC2)

- **build-and-upload.bat** (run on Windows, from repo root via `deploy\build-and-upload.bat`): builds web (Next.js standalone), stages **`web/`**, **`api/`**, and **`games/`** into `deploy/staging/gamedev-king/`, zips that tree, uploads to S3 as a timestamped zip and as **`latest.zip`**. The **`games/`** tree (e.g. `manifest.json`, `pocket_voyager`) is required at runtime: the API imports `games.*` and reads `games/manifest.json` next to `api/`. Requires [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and `npm` in PATH. Use `aws configure` (access keys) or SSO; optional **`AWS_PROFILE`** selects the profile. Optional overrides before running the batch file (same `cmd` session): `set S3_BUCKET=...`, `set S3_PREFIX=releases`, `set PRODUCTION_API_URL=https://your-domain/api` (baked into the Next.js client).
- **ec2-deploy.sh** (run on EC2): downloads the zip from S3, `rsync`s **`web/`**, **`api/`**, and **`games/`** into `APP_ROOT`, restores `api/.env`, recreates/updates the API venv and `pip install -r requirements.txt`, runs **`systemctl daemon-reload`** and restarts **`gamedev-api`** and **`gamedev-web`**. Environment overrides: `APP_ROOT`, `S3_BUCKET`, `S3_PREFIX`, `RESTART_SERVICES=0` to skip restarts. See **Get zip from S3 and deploy** below.
- **gamedev-web-standalone.service.example** — Use this for the web service when deploying via S3. It runs `node server.js` instead of `npm start`. Copy to `/etc/systemd/system/gamedev-web.service` and run `sudo systemctl daemon-reload && sudo systemctl restart gamedev-web`.

### Get zip from S3 and deploy (on EC2)

Prereqs on the instance: AWS CLI (or IAM instance role with S3 read), `unzip`, `rsync`, Node.js, **Python 3.10+** (API dependency `mcp` requires it). The app must already exist at `APP_ROOT` (e.g. first deploy: clone the repo or create the directory and put `api/.env` in place). On Amazon Linux 2, install Python 3.11 if needed: `sudo dnf install python3.11`.

**1. SSH into EC2**

```bash
ssh -i .\Oregon_DevBloom.pem ec2-user@dev.funbloomstudio.com
```

**2. Go to the app directory**

```bash
cd /home/ec2-user/gamedev-king
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

The script will: download from `s3://devbloom/releases/latest.zip` (or the given key), extract, sync `web/`, `api/`, and `games/` into `/home/ec2-user/gamedev-king`, keep existing `api/.env`, run `pip install -r requirements.txt` in the API venv, run `daemon-reload`, and restart `gamedev-api` and `gamedev-web`.

**5. Check services**

```bash
sudo systemctl status gamedev-api gamedev-web
```

To use a different app root (e.g. `/opt/gamedev-king`):

```bash
APP_ROOT=/opt/gamedev-king ./deploy/ec2-deploy.sh
```

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
- **reload units**: `sudo systemctl daemon-reload`
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

