# Deploy to AWS (EC2)

Point-by-point guide for **dev.funbloomstudio.com** (or your own domain). Builds on Windows, ships to **S3**, deploys on **EC2** with **nginx** + **systemd**.

**EC2 app root:** `/home/ec2-user/github/devbloom` (set `APP_ROOT` to this path when deploying).

---

## What gets deployed

| Piece | On EC2 | Notes |
|-------|--------|--------|
| **Web** | `APP_ROOT/web/` | Next.js **standalone** (`node server.js`) |
| **API** | `APP_ROOT/api/` | FastAPI on `127.0.0.1:8000` |
| **Games** | `APP_ROOT/games/` | Required — API imports `games.*` |
| **Python venv** | `APP_ROOT/.venv/` | From root [`requirements.txt`](../requirements.txt) |
| **Secrets** | `APP_ROOT/api/.env` | **Never** in the zip — kept on the server |

**Not on EC2:** `local_agent/` runs on each developer’s PC only.

---

## One-time EC2 setup

Do this once per server (or after a fresh instance).

### 1. Install prerequisites

- **Amazon Linux 2023** (or similar) with **Python 3.10+** (`python3.11` recommended)
- **Node.js 18+** (for standalone web)
- **nginx**, **certbot**, **AWS CLI** (or IAM instance role with S3 read)
- **unzip**, **rsync**

### 2. Clone the repo on EC2

The deploy script (`ec2-deploy.sh`) lives in the repo. Clone it once on the server before anything else.

1. **SSH into EC2:**
   ```bash
   ssh -i .\Oregon_DevBloom.pem ec2-user@dev.funbloomstudio.com
   ```

2. **Install git** (if not already installed):
   ```bash
   sudo dnf install -y git
   ```

3. **Create the parent folder and clone:**
   ```bash
   mkdir -p /home/ec2-user/github
   cd /home/ec2-user/github
   git clone <your-repo-url> devbloom
   ```
   Example: `git clone https://github.com/FunBloom/devbloom.git devbloom`  
   (Use SSH or a personal access token if the repo is private.)

4. **Enter the repo and make deploy scripts executable:**
   ```bash
   cd /home/ec2-user/github/devbloom
   chmod +x deploy/*.sh
   ```

5. **Later — pull deploy script updates** (optional, before running `ec2-deploy.sh`):
   ```bash
   cd /home/ec2-user/github/devbloom
   git pull
   ```

App code for production still comes from **S3** (`build-and-upload.bat` → `ec2-deploy.sh`). The git clone is mainly for **`deploy/`** scripts, service templates, and docs on the server.

### 3. Add API secrets

Create **`/home/ec2-user/github/devbloom/api/.env`** (copy from [`api/.env.example`](../api/.env.example)):

- `OPENAI_API_KEY`, Supabase keys, `CORS_ORIGINS=https://dev.funbloomstudio.com`
- `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`

This file stays on the server; deploy never overwrites it.

### 4. Register API and web as Linux services (systemd)

EC2 must run two background apps (API on port 8000, web on port 3000). Linux starts them using **service definition files** in `/etc/systemd/system/`.

**Do this once on the EC2 server:**

1. **SSH in** and go to the app folder:
   ```bash
   cd /home/ec2-user/github/devbloom
   ```

2. **Copy the API service template** (repo → systemd):
   - **From:** `/home/ec2-user/github/devbloom/deploy/devbloom-api.service.example`
   - **To:** `/etc/systemd/system/devbloom-api.service`
   ```bash
   sudo cp /home/ec2-user/github/devbloom/deploy/devbloom-api.service.example /etc/systemd/system/devbloom-api.service
   ```

3. **Copy the web service template** (repo → systemd):
   - **From:** `/home/ec2-user/github/devbloom/deploy/devbloom-web-standalone.service.example`
   - **To:** `/etc/systemd/system/devbloom-web.service`
   ```bash
   sudo cp /home/ec2-user/github/devbloom/deploy/devbloom-web-standalone.service.example /etc/systemd/system/devbloom-web.service
   ```

4. **Open the API service file and confirm these paths** (edit with `sudo nano /etc/systemd/system/devbloom-api.service` if needed):
   - `WorkingDirectory=/home/ec2-user/github/devbloom/api`
   - `EnvironmentFile=/home/ec2-user/github/devbloom/api/.env`
   - `ExecStart=/home/ec2-user/github/devbloom/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000`  
     (Python must use **`/home/ec2-user/github/devbloom/.venv`**, not `.../api/.venv`)

5. **Open the web service file and confirm these paths** (edit with `sudo nano /etc/systemd/system/devbloom-web.service` if needed):
   - `WorkingDirectory=/home/ec2-user/github/devbloom/web`
   - `ExecStart=/usr/bin/node server.js`
   - `Environment=NEXT_PUBLIC_API_URL_BASE=https://dev.funbloomstudio.com/api`

6. **Load the new service definitions and enable on boot:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable devbloom-api devbloom-web
   ```

7. **Start them** (after first deploy, or now if code is already on the server):
   ```bash
   sudo systemctl start devbloom-api devbloom-web
   sudo systemctl status devbloom-api devbloom-web
   ```

**Summary — files involved:**

| Purpose | Full path on EC2 |
|---------|------------------|
| App root | `/home/ec2-user/github/devbloom` |
| API secrets (you create) | `/home/ec2-user/github/devbloom/api/.env` |
| API template in repo | `/home/ec2-user/github/devbloom/deploy/devbloom-api.service.example` |
| API systemd service (you install) | `/etc/systemd/system/devbloom-api.service` |
| Web template in repo | `/home/ec2-user/github/devbloom/deploy/devbloom-web-standalone.service.example` |
| Web systemd service (you install) | `/etc/systemd/system/devbloom-web.service` |
| Python venv (created by deploy) | `/home/ec2-user/github/devbloom/.venv` |
| API code | `/home/ec2-user/github/devbloom/api` |
| Web build | `/home/ec2-user/github/devbloom/web` |

### 5. Configure nginx

- Copy [`nginx-devbloom-dev.conf.example`](nginx-devbloom-dev.conf.example) → `/etc/nginx/conf.d/devbloom.conf`
- Replace domain if needed
- `sudo nginx -t && sudo systemctl enable --now nginx`
- HTTPS: `sudo certbot --nginx -d dev.funbloomstudio.com`

### 6. First deploy (creates `.venv` and syncs app from S3)

After `build-and-upload.bat` on your PC (see **Every release** below), run on EC2:

```bash
cd /home/ec2-user/github/devbloom
./deploy/ec2-deploy.sh
sudo systemctl start devbloom-api devbloom-web nginx
```

---

## Every release (Windows → S3 → EC2)

### Step 1 — Build and upload (your PC)

From repo root, run:

→ **[`deploy/build-and-upload.bat`](build-and-upload.bat)**

Optional overrides (same `cmd` session before running):

```bat
set PRODUCTION_API_URL=https://dev.funbloomstudio.com/api
set S3_BUCKET=devbloom
set S3_PREFIX=releases
set AWS_PROFILE=your-sso-profile
```

The script:

1. Verifies AWS credentials
2. Builds Next.js with production API URL
3. Stages `web/`, `api/`, `games/`, root **`requirements.txt`**
4. Zips as `devbloom/`
5. Uploads to `s3://devbloom/releases/<timestamp>.zip` and **`latest.zip`**

### Step 2 — Deploy on EC2

**First time on this server?** Complete **One-time setup** above (especially **§2 Clone the repo**).

SSH in:

```bash
ssh -i .\Oregon_DevBloom.pem ec2-user@dev.funbloomstudio.com
cd /home/ec2-user/github/devbloom
git pull
```

Run deploy (**creates `.venv`, syncs code from S3, restarts services**):

```bash
./deploy/ec2-deploy.sh
```

The script prints `APP_ROOT=...` at the start — it should be `/home/ec2-user/github/devbloom` (the repo you cloned). Override only if your layout differs:

```bash
APP_ROOT=/home/ec2-user/github/devbloom ./deploy/ec2-deploy.sh
```

The script:

1. Downloads `s3://devbloom/releases/latest.zip`
2. Syncs `web/`, `api/`, `games/` into `APP_ROOT`
3. Copies root `requirements.txt`
4. **Restores** existing `api/.env`
5. **Removes legacy `api/.venv`** if present
6. Creates/updates **`APP_ROOT/.venv`** and `pip install -r requirements.txt`
7. Restarts `devbloom-api` and `devbloom-web`

**`.venv` is not in git or the zip** — it is created on the server by step 6 above. If the folder is missing, run the deploy command again with the correct `APP_ROOT`.

**Create `.venv` manually** (only if you cannot use S3 deploy yet):

```bash
cd /home/ec2-user/github/devbloom
python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn --version
sudo systemctl restart devbloom-api
```

Skip service restart during deploy:

```bash
RESTART_SERVICES=0 APP_ROOT=/home/ec2-user/github/devbloom ./deploy/ec2-deploy.sh
```

### Step 3 — Verify

```bash
sudo systemctl status devbloom-api devbloom-web nginx
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/docs
```

Open **https://dev.funbloomstudio.com** in a browser. Header **API Server** dot should be green.

---

## Wrong folder: `/home/ec2-user/devbloom`

If deploy created **`~/devbloom`** (or `/home/ec2-user/devbloom`) **in addition to** your git clone at `/home/ec2-user/github/devbloom`, an older `ec2-deploy.sh` used that path as the default `APP_ROOT`.

**What to do:**

1. **Pull the latest deploy script** (auto-detects the clone path):
   ```bash
   cd /home/ec2-user/github/devbloom
   git pull
   ```

2. **Redeploy into the clone** (check the printed line `APP_ROOT=/home/ec2-user/github/devbloom`):
   ```bash
   ./deploy/ec2-deploy.sh
   ```

3. **Confirm systemd** points at the clone, not `~/devbloom` — see **§4** paths table.

4. **Remove the stray copy** once services work from the clone:
   ```bash
   rm -rf /home/ec2-user/devbloom
   ```
   (If you put `api/.env` only under the clone, nothing important is lost in `~/devbloom`.)

---

## Migrating from the old layout (`api/.venv`)

If the server still uses **`api/.venv`**:

1. Update **`devbloom-api.service`** — `ExecStart` → `.../devbloom/.venv/bin/uvicorn ...` (see example file)
2. Run deploy again:
   ```bash
   APP_ROOT=/home/ec2-user/github/devbloom ./deploy/ec2-deploy.sh
   ```
3. `sudo systemctl daemon-reload && sudo systemctl restart devbloom-api`

---

## Common commands (EC2)

### Status

```bash
sudo systemctl status nginx devbloom-api devbloom-web
```

### Restart

```bash
sudo systemctl daemon-reload
sudo systemctl restart devbloom-api devbloom-web
sudo systemctl reload nginx
```

### Logs

```bash
sudo journalctl -u devbloom-api -n 50 --no-pager
sudo journalctl -u devbloom-web -n 50 --no-pager
sudo tail -n 30 /var/log/nginx/error.log
```

### Diagnose site down (services green, domain unreachable)

```bash
bash deploy/diagnose-site.sh
```

**Most common:** `devbloom-api` and `devbloom-web` listen on **127.0.0.1** only. **nginx** must be running to expose them on ports **80/443**.

1. **Install nginx config** (once):
   ```bash
   sudo cp /home/ec2-user/github/devbloom/deploy/nginx-devbloom-dev.conf.example /etc/nginx/conf.d/devbloom.conf
   sudo nginx -t
   sudo systemctl enable --now nginx
   ```

2. **Verify upstreams respond on the server:**
   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
   curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/docs
   ```
   Expect **200** (or **307** for web). If these fail, fix api/web first.

3. **Verify nginx proxies locally:**
   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" -H "Host: dev.funbloomstudio.com" http://127.0.0.1/
   ```

4. **HTTPS** (if you use https:// in the browser):
   ```bash
   sudo certbot --nginx -d dev.funbloomstudio.com
   ```
   After certbot, confirm the **443** `server { }` block still has `location /api/` → port 8000 (see comment in nginx example).

5. **EC2 security group:** inbound **TCP 80** and **443** from `0.0.0.0/0` (or your IP range).

6. **DNS:** `dev.funbloomstudio.com` A record → this EC2 public IP.

### Diagnose 502 on `/api/...`

```bash
bash deploy/diagnose-api.sh
```

nginx proxies `/api/` → `127.0.0.1:8000`. A **502** means the API is down or nginx misconfigured on HTTPS.

---

## Local Agent artist release (private S3 → EC2 download)

Artists install a **standalone Windows zip** (no full repo). S3 stays **private** (same permissions as EC2 releases). EC2 pulls the zip and **nginx** serves it at `/downloads/`.

### 1. Build and upload (your PC)

→ **[`deploy/build-local-agent-release.bat`](build-local-agent-release.bat)**

Optional:

```bat
set SkipUpload=1
set S3_BUCKET=devbloom
set S3_PREFIX=releases/local-agent
deploy\build-local-agent-release.bat
```

Uploads to **private** S3:

```
s3://devbloom/releases/local-agent/local-agent-<timestamp>.zip
s3://devbloom/releases/local-agent/latest.zip
```

No public bucket policy required.

### 2. Sync to EC2 (on deploy)

[`ec2-deploy.sh`](ec2-deploy.sh) automatically runs:

```bash
aws s3 cp s3://devbloom/releases/local-agent/latest.zip \
  $APP_ROOT/downloads/local-agent/latest.zip
```

**Local-agent only** (without full app deploy):

```bash
mkdir -p /home/ec2-user/github/devbloom/downloads/local-agent
aws s3 cp s3://devbloom/releases/local-agent/latest.zip \
  /home/ec2-user/github/devbloom/downloads/local-agent/latest.zip
```

### 3. nginx

[`nginx-devbloom-dev.conf.example`](nginx-devbloom-dev.conf.example) includes:

```nginx
location /downloads/ {
    alias /home/ec2-user/github/devbloom/downloads/;
}
```

After **certbot**, add the same `location /downloads/` block to the **443 ssl** server (like `/api/`).

Artist download URL:

```
https://dev.funbloomstudio.com/downloads/local-agent/latest.zip
```

Baked into web build (`build-and-upload.bat`):

```
NEXT_PUBLIC_LOCAL_AGENT_DOWNLOAD_URL=https://dev.funbloomstudio.com/downloads/local-agent/latest.zip
```

Artist flow: **Download zip** → unzip → run **`install.bat`** once → **Settings → Installation → Start Local Agent**.

Templates live in [`deploy/local-agent-release/`](local-agent-release/).

---

## Config files in this folder

| File | Purpose |
|------|---------|
| [`build-and-upload.bat`](build-and-upload.bat) | Windows build + S3 upload |
| [`build-local-agent-release.bat`](build-local-agent-release.bat) | Artist Local Agent zip → private S3 |
| [`ec2-deploy.sh`](ec2-deploy.sh) | EC2 pull from S3 + venv + restart |
| [`diagnose-api.sh`](diagnose-api.sh) | Troubleshoot API / 502 |
| [`diagnose-site.sh`](diagnose-site.sh) | Site down while api/web are green |
| [`devbloom-api.service.example`](devbloom-api.service.example) | systemd — API (root `.venv`) |
| [`devbloom-web-standalone.service.example`](devbloom-web-standalone.service.example) | systemd — Next standalone |
| [`nginx-devbloom-dev.conf.example`](nginx-devbloom-dev.conf.example) | nginx for dev.funbloomstudio.com |
| [`nginx-devbloom.conf.example`](nginx-devbloom.conf.example) | Generic nginx template |

---

## Production env checklist

**`api/.env` (on EC2)**

- `CORS_ORIGINS=https://dev.funbloomstudio.com` (comma-separate extra origins if needed)
- Supabase URL + service role + JWT secret
- OpenAI key

**Web build (baked at build time via `build-and-upload.bat`)**

- `NEXT_PUBLIC_API_URL_BASE=https://dev.funbloomstudio.com/api`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in web env when building, or via CI)

**Supabase Dashboard**

- **Site URL** and **Redirect URLs** for your production domain

---

## Previous documentation

Full older deploy notes (legacy zip names, extra troubleshooting) are in [`Old_deploy_README.md`](Old_deploy_README.md).
