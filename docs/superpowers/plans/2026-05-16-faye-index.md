# Faye Implementation Plan — Index

Spec: `docs/superpowers/specs/2026-05-16-faye-design.md`

Faye ships in 8 phases. Each phase is its own plan + produces working software. Write each successive plan after the prior phase ships, so each plan reflects real implementation decisions.

| # | Plan | Outcome |
|---|------|---------|
| 1 | [Foundations](./2026-05-16-faye-01-foundations.md) | Log in, see empty dashboard |
| 2 | Artist & asset management *(to write)* | Onboard an artist with assets |
| 3 | External clients *(to write)* | FB / Feature.fm / Spotify / OpenRouter / Resend adapters w/ mocks |
| 4 | Campaign creation + manual publishing *(to write)* | Create campaign, push a hand-written ad via FB |
| 5 | Composite scoring + bandit + publisher tick *(to write)* | Bandit operates on real metrics |
| 6 | LLM critique + generate + safety + daily cron *(to write)* | Autonomous daily loop |
| 7 | Email digest + approve/reject *(to write)* | Review loop closes |
| 8 | Dashboards + cost tracking + polish *(to write)* | Production-ready |

**Out-of-band, runs in parallel from Day 1:**
- Submit Meta Marketing API Advanced Access app review
- Apply to Spotify for Artists API partner program
- Confirm Feature.fm tier exposes stream-conversion analytics
- Provision Hetzner CX22 + Caddy + Postgres + Backblaze B2 bucket
