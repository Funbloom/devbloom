# Deploy examples (EC2 + nginx + HTTPS)

Use these with the main README’s **EC2 / Production** section.

- **nginx-gamedevking.conf.example** — Copy to `/etc/nginx/conf.d/gamedevking.conf`, replace `yourdomain.com`, then `sudo nginx -t && sudo systemctl reload nginx`. Run certbot for HTTPS.
- **gamedev-api.service.example** — Copy to `/etc/systemd/system/gamedev-api.service`. Set `WorkingDirectory`, `EnvironmentFile`, and `ExecStart` to your app path (e.g. `/home/ec2-user/gamedev-king/api`). Then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-api`.
- **gamedev-web.service.example** — Copy to `/etc/systemd/system/gamedev-web.service`. Set `WorkingDirectory` and `NEXT_PUBLIC_API_URL_BASE` to your API URL. Then `sudo systemctl daemon-reload && sudo systemctl enable --now gamedev-web`.

Replace `/home/ec2-user/gamedev-king` and `ec2-user` if your app lives elsewhere or runs as another user.
