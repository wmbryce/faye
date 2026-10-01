# Faye deployment

Single Hetzner CX22 (or larger). Stack: Caddy → Next.js (Node 22) → Postgres 15, all docker compose. CI builds an image on every push to main and SSH-deploys via `.github/workflows/deploy.yml`.

## First-time setup

### 1. Provision the box

Hetzner cloud console → new server:
- Image: Ubuntu 24.04
- Type: CX22 (4 GB / 2 vCPU; CX32 if you expect more than a handful of artists)
- SSH key: your personal pubkey
- Datacenter: nearest to you

SSH in as root.

### 2. Run bootstrap

```bash
curl -fsSL https://raw.githubusercontent.com/wmbryce/faye/main/deploy/bootstrap-hetzner.sh | sudo bash
```

The script installs Docker, creates `/opt/faye`, configures UFW + swap, and prints next-step instructions. Follow them.

### 3. Generate a deploy keypair (on your laptop)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/faye-deploy -C "github-actions-faye" -N ""
```

On the box:

```bash
sudo -u faye sh -c 'cat >> /home/faye/.ssh/authorized_keys' < /dev/stdin
# paste ~/.ssh/faye-deploy.pub here, hit Ctrl-D
```

### 4. Fill in `.env` on the box

```bash
sudo -u faye cp /opt/faye/.env.example /opt/faye/.env
sudo -u faye nano /opt/faye/.env
```

Required values: `POSTGRES_PASSWORD`, `AUTH_TOKEN_SECRET` (32+ chars), `OPERATOR_EMAIL`, `RESEND_API_KEY`, `APP_URL` (e.g. `http://<box-ip>`), `FB_WEBHOOK_VERIFY_TOKEN`, `FB_WEBHOOK_APP_SECRET`.

### 5. GHCR auth on the box (one-time)

```bash
sudo -u faye docker login ghcr.io -u wmbryce
# paste a GitHub PAT with read:packages scope
```

### 6. Add GitHub repo secrets

In `wmbryce/faye` → Settings → Secrets → Actions:

| Name | Value |
|---|---|
| `HETZNER_HOST` | Your box's public IP |
| `HETZNER_SSH_KEY` | Contents of `~/.ssh/faye-deploy` (the private key, including BEGIN/END lines) |

Also create a `production` environment under Settings → Environments (the deploy workflow references it).

### 7. First deploy

Push a commit to `main` (or trigger `deploy` manually from the Actions tab). The workflow:
1. Builds the image, pushes to `ghcr.io/wmbryce/faye:sha-<short>` + `:latest`
2. SSHes to the box as `faye`
3. `docker compose pull web`
4. Runs `pnpm db:migrate` in a one-shot container
5. Recreates `web` with the new image
6. Probes `/api/health` for 30s

If health fails, the workflow tails container logs and exits non-zero.

### 8. Install cron (after first successful deploy)

```bash
sudo mkdir -p /var/log/faye && sudo chown faye:faye /var/log/faye
sudo cp /opt/faye/cron.example /etc/cron.d/faye
sudo systemctl restart cron
```

## Day-to-day operations

### Watch logs

```bash
ssh faye@<box-ip>
cd /opt/faye
docker compose logs -f web        # app
docker compose logs -f caddy      # proxy
docker compose logs --since 1h    # everything, last hour
```

### Manual migration

```bash
docker compose run --rm web pnpm db:migrate
```

### Manual rollback to a previous image

```bash
# list available tags
docker images ghcr.io/wmbryce/faye

# point compose at a specific sha and recreate
FAYE_IMAGE_TAG=sha-<short> docker compose up -d --force-recreate web
```

The `latest` tag still points at the newest image; the env var override only affects this restart. To make it sticky, set `FAYE_IMAGE_TAG=sha-<short>` in `.env`.

### Restore from backup

```bash
# Pull the dump from B2
b2 file download b2://faye-backups/db/<timestamp>.sql.gz /tmp/restore.sql.gz

# Drop + recreate the DB
docker compose exec -T postgres psql -U faye -d postgres -c "DROP DATABASE IF EXISTS faye;"
docker compose exec -T postgres psql -U faye -d postgres -c "CREATE DATABASE faye OWNER faye;"
gunzip -c /tmp/restore.sql.gz | docker compose exec -T postgres psql -U faye -d faye
```

### Update Caddy config

Edit `/opt/faye/Caddyfile` then:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

When you get a domain, replace `:80` with `your.domain.com` — Caddy will fetch a Let's Encrypt cert on next reload. Open port 443 in UFW first: `sudo ufw allow 443/tcp`.

## CI/CD

- **`.github/workflows/ci.yml`** — runs on every PR + push to main. Spins up postgres, runs `pnpm typecheck && pnpm test && pnpm build`. Required for merge.
- **`.github/workflows/deploy.yml`** — runs only on push to main (after CI). Builds + pushes + deploys. Concurrency-locked so two deploys can't race.

To deploy a hotfix without a new commit: Actions tab → deploy → "Run workflow" against `main`.

## Stack reference

```
[ Internet ]
     ↓ :80
[ Caddy container ]  (deploy/Caddyfile, reverse_proxy to web:3000)
     ↓
[ Web container ]    (ghcr.io/wmbryce/faye, Node 22, Next standalone)
     ↓
[ Postgres container ]  (postgres:15-alpine, volume `pg-data`)
```

Volumes:
- `pg-data` — Postgres data. Survives compose down. Loss = total data loss.
- `caddy-data`, `caddy-config` — Caddy state.
- `/opt/faye/uploads` — bind mount for user-uploaded assets.

## Troubleshooting

**Deploy fails at health check.** Check `docker compose logs web` — usually a missing env var or a migration that needs running.

**Postgres won't start.** Check disk space (`df -h`). Volume corruption is rare but visible in logs.

**Caddy 502s.** Web container is down or unreachable. `docker compose ps` to see status.

**CI deploy can't SSH.** GH secret `HETZNER_SSH_KEY` must include the BEGIN/END lines and a trailing newline. Test locally: `ssh -i ~/.ssh/faye-deploy faye@<box-ip>`.

**Out of memory.** CX22 only has 4 GB. Swap helps (bootstrap adds 2 GB). If killing OOM frequently, bump to CX32.
