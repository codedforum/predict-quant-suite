# Deploy notes

## Frontend: predict-surface-studio → predict.smartcoded.xyz (Hostinger static)

```bash
# Local
cd predict-surface-studio
npm run build                                      # outputs dist/

# Upload (via VPS bounce per [[feedback_hostinger_ssh_via_vps]])
/tmp/vps_scp.exp dist/index.html /tmp/pqs-index.html
/tmp/vps_scp.exp dist/assets/   /tmp/pqs-assets   # recursive: tar+ssh is easier
/tmp/vps_ssh.exp "tar -cz -C /Users/smartcoded2011/sui-overflow/predict-surface-studio/dist . > /tmp/pqs.tgz"
# Or build remotely and untar into the Hostinger docroot:
/tmp/vps_ssh.exp "sshpass -p '@Thesmartcodedforum1' ssh -o StrictHostKeyChecking=no -p 65002 u935816303@82.180.168.216 'mkdir -p ~/domains/smartcoded.xyz/public_html/predict-app'"
# Upload the tarball through the VPS, then untar on Hostinger.
```

Set `VITE_PREDICT_SERVER` env at build time if you want it baked in:

```bash
VITE_PREDICT_SERVER=https://predict-api.smartcodedbot.com npm run build
```

## Backend: predict-vol-arb dashboard → predict-api.smartcodedbot.com (VPS, PM2)

```bash
# On the VPS
cd /root
git clone https://github.com/codedforum/predict-quant-suite.git
cd predict-quant-suite/predict-vol-arb
npm install
cp .env.example .env       # edit: PREDICT_PKG, PREDICT_OBJECT, DUSDC_TYPE, CORS_ORIGINS
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # one-time: enable on reboot

# nginx
cp /root/predict-quant-suite/deploy/nginx-predict-api.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/nginx-predict-api.conf /etc/nginx/sites-enabled/predict-api.smartcodedbot.com
nginx -t && systemctl reload nginx
certbot --nginx -d predict-api.smartcodedbot.com
```

## TG bot: predict-tg-bot → VPS, PM2 (no public URL)

```bash
cd /root/predict-quant-suite/predict-tg-bot
npm install
cp .env.example .env       # edit: TG_TOKEN, WALLET_ENC_KEY, PREDICT_PKG, PREDICT_OBJECT, DUSDC_TYPE
pm2 start ecosystem.config.cjs
pm2 save
```

## DNS

| Hostname | Type | Value |
|---|---|---|
| `predict.smartcoded.xyz` | CNAME | (Hostinger - via cPanel "Subdomains") |
| `predict-api.smartcodedbot.com` | A | 76.13.40.192 |

## Cache-bust on every deploy

Per [[feedback_cache_bust]] - bump asset version strings before the SFTP push, especially after any frontend build whose hashes don't roll on every change.

## Smoke tests after deploy

```bash
# frontend should serve real Vite app, NOT the Hostinger fallback
curl -s https://predict.smartcoded.xyz/ | grep -oE '<title>[^<]+</title>'
# expect: <title>Predict Surface Studio | DeepBook Predict</title>

# backend should respond 200 with JSON
curl -s https://predict-api.smartcodedbot.com/healthz
# expect: {"ok":true,"ts":...}

curl -s https://predict-api.smartcodedbot.com/api/state | head -c 200
```
