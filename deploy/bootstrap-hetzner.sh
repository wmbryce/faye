#!/usr/bin/env bash
# Faye one-shot bootstrap for a fresh Hetzner CX22 (Ubuntu 24.04).
# Run as root on the box. Idempotent — safe to re-run.
#
# What it does:
#   1. updates apt + installs essentials (docker, ufw, fail2ban)
#   2. creates `faye` user with docker access
#   3. configures ufw (22, 80; 443 reserved for future TLS)
#   4. adds 2GB swap (CX22 only has 4GB RAM)
#   5. creates /opt/faye and seeds docker-compose.yml + Caddyfile
#   6. writes /opt/faye/.env.example for you to fill in
#   7. installs the GHCR pull credential template
#   8. registers cron entries for nightly backup + daily/publisher/metrics/bandit
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wmbryce/faye/main/deploy/bootstrap-hetzner.sh | sudo bash
# or scp it up and run: sudo bash bootstrap-hetzner.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

REPO="wmbryce/faye"
APP_DIR="/opt/faye"
APP_USER="faye"

echo "==> apt update + install base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban git

echo "==> install Docker Engine"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> create $APP_USER user"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
fi
usermod -aG docker "$APP_USER"

echo "==> $APP_DIR scaffolding"
mkdir -p "$APP_DIR"/{uploads,backups}
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 755 "$APP_DIR"

# Pull compose stack + Caddyfile from the repo (raw github).
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/docker-compose.yml" -o "$APP_DIR/docker-compose.yml"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/deploy/Caddyfile" -o "$APP_DIR/Caddyfile"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/.env.example" -o "$APP_DIR/.env.example"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/deploy/backup.sh" -o "$APP_DIR/backup.sh"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/deploy/cron.example" -o "$APP_DIR/cron.example"
chmod +x "$APP_DIR/backup.sh"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> ufw firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> 2GB swap"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "==> SSH deploy key for CI"
DEPLOY_KEY_DIR="/home/$APP_USER/.ssh"
mkdir -p "$DEPLOY_KEY_DIR"
touch "$DEPLOY_KEY_DIR/authorized_keys"
chmod 700 "$DEPLOY_KEY_DIR"
chmod 600 "$DEPLOY_KEY_DIR/authorized_keys"
chown -R "$APP_USER:$APP_USER" "$DEPLOY_KEY_DIR"

cat <<'EOF'

================================================================
BOOTSTRAP COMPLETE.

NEXT STEPS — do these now, on this box:

  1. Append your CI deploy public key:
       echo "ssh-ed25519 AAAA... fayeci" >> /home/faye/.ssh/authorized_keys

  2. Fill in /opt/faye/.env (copy from .env.example):
       sudo -u faye cp /opt/faye/.env.example /opt/faye/.env
       sudo -u faye nano /opt/faye/.env
     Set: POSTGRES_PASSWORD, AUTH_TOKEN_SECRET (32+ random chars),
          OPERATOR_EMAIL, RESEND_API_KEY, APP_URL (http://<this-IP>),
          FB_WEBHOOK_VERIFY_TOKEN, FB_WEBHOOK_APP_SECRET.

  3. Authenticate Docker against GHCR (read-only PAT with read:packages):
       sudo -u faye docker login ghcr.io -u wmbryce

  4. First pull + start:
       cd /opt/faye
       sudo -u faye docker compose pull
       sudo -u faye docker compose up -d
       sudo -u faye docker compose exec web pnpm db:migrate

  5. Verify:
       curl -i http://localhost/api/health
       sudo -u faye docker compose logs -f web

  6. Install cron (review /opt/faye/cron.example first):
       sudo cp /opt/faye/cron.example /etc/cron.d/faye
       sudo systemctl restart cron

After step 2 you can hand the box IP off to GitHub Actions.
================================================================
EOF
