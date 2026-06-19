# Faye

Autonomous marketing operator that places Facebook ads to drive Spotify listens. It manages artists, releases, audiences, assets, campaigns, ad approvals, first-party smartlinks, metrics ingestion, and the daily LLM loop that proposes new ad variants.

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

The test suite covers auth, secrets, artists/releases/assets, campaign lifecycle, Facebook/Spotify/smartlink adapters, metrics ingestion, scoring, bandit pruning, daily loop generation/critique/safety, approval/reject tokens, digest email, and DB integration paths.

## Runtime jobs

Operational scripts live under `scripts/`:

- `pnpm tsx scripts/daily.ts` — run the daily campaign loop.
- `pnpm tsx scripts/metrics-pull.ts` — pull ad/smartlink/Spotify metrics.
- `pnpm tsx scripts/publish-tick.ts` — publish staged work when due.
- `pnpm tsx scripts/digest.ts` — send operator digest email.
- `pnpm tsx scripts/bandit-step.ts` — run bandit allocation/pruning step.

Core loop code lives in `lib/loop/`; external adapters live in `lib/fb/`, `lib/spotify/`, `lib/smartlink/`, and `lib/llm/`.

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

> Ensure `/opt/faye/.env` is `chmod 600` and owned by the `faye` user; `backup.sh` sources it via `set -o allexport` and the resulting process env briefly carries `DATABASE_URL`.

Restore drill: `b2 file download b2://faye-backups/db/<file>.sql.gz - | gunzip | psql faye_dev` against a scratch DB. Run weekly during the first month to verify.
