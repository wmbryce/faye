# Faye

Autonomous agent that places Facebook ads to drive Spotify listens.

See `docs/superpowers/specs/2026-05-16-faye-design.md` for design.
See `docs/superpowers/plans/2026-05-16-faye-index.md` for the phased plan.

## Local dev

Prereqs: Node 22, pnpm 9, Postgres 16, a Resend API key.

```bash
createdb faye_dev
createdb faye_test
cp .env.example .env
# fill in .env — use `openssl rand -hex 32` for AUTH_*_SECRET
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000/login and sign in with the `OPERATOR_EMAIL` from `.env`.

## Tests

```bash
pnpm test
```

## Deploy (Hetzner CX22)

- Provision Ubuntu 24.04, install Node 22 + pnpm + Postgres 16 + Caddy
- Clone repo to `/opt/faye`, run `pnpm install --prod && pnpm build && pnpm db:migrate`
- Copy `deploy/faye-web.service` to `/etc/systemd/system/`, enable + start
- Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, reload Caddy
- `pg_dump` cron → Backblaze B2 (configured in Phase 8)

## Backups

Nightly `pg_dump` of `faye_prod` → gzip → Backblaze B2 (`b2://faye-backups/db/<UTC-timestamp>.sql.gz`). The cron line lives in `deploy/cron.example`; the script is `deploy/backup.sh`.

Prereqs on the deploy box:
- `postgresql-client` (`pg_dump`) installed
- `b2` CLI installed + authorized for the `faye-backups` bucket
- `BACKUP_BUCKET` (defaults to `faye-backups`) settable via env

Restore drill: `b2 file download b2://faye-backups/db/<file>.sql.gz - | gunzip | psql faye_dev` against a scratch DB. Run weekly during the first month to verify.
