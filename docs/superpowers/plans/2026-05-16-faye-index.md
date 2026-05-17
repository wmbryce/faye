# Faye Implementation Plan — Index

Spec: `docs/superpowers/specs/2026-05-16-faye-design.md`

Faye ships in 8 phases. Each phase is its own plan + produces working software. Write each successive plan after the prior phase ships, so each plan reflects real implementation decisions.

| # | Plan | Outcome |
|---|------|---------|
| 1 | [Foundations](./2026-05-16-faye-01-foundations.md) | Log in, see empty dashboard |
| 2 | [Artist & asset management](./2026-05-16-faye-02-artist-asset-mgmt.md) | Onboard an artist with assets, releases, audience seeds |
| 3 | [External clients](./2026-05-16-faye-03-external-clients.md) | FB / Feature.fm / Spotify / OpenRouter adapters + encrypted secrets |
| 4 | [Campaign creation + manual publishing](./2026-05-16-faye-04-campaigns.md) | Create campaign, hand-write + publish ads via FB |
| 5 | [Composite scoring + bandit + publisher tick](./2026-05-16-faye-05-scoring-bandit.md) | Bandit operates on real metrics |
| 6 | [LLM critique + generate + safety + daily cron](./2026-05-16-faye-06-daily-llm-loop.md) | Autonomous daily loop |
| 7 | [Email digest + approve/reject](./2026-05-16-faye-07-email-approve-reject.md) | Review loop closes |
| 8 | [Dashboards + cost tracking + polish](./2026-05-16-faye-08-dashboards-polish.md) | Production-ready |

**Out-of-band, runs in parallel from Day 1:**
- Submit Meta Marketing API Advanced Access app review
- Apply to Spotify for Artists API partner program
- Confirm Feature.fm tier exposes stream-conversion analytics
- Provision Hetzner CX22 + Caddy + Postgres + Backblaze B2 bucket
