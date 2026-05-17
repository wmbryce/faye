# Faye Design System

**Date:** 2026-05-17
**Owner:** Michael Bryce
**Status:** active — all future phases inherit

Direction: **soft refined product, Linear-adjacent but distinct**. Dark default. Coral accent (not purple). Tight typography. Subtle borders. Smooth micro-interactions. Geist throughout. Made for daily-use by one operator with future data density (charts + dense tables for ad performance).

---

## 1. Tokens

### Color (HSL via CSS variables, dark-only for v1)

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--background` | `#0A0A0C` | `240 7% 4%` | page base |
| `--surface-1` | `#111114` | `240 7% 7%` | raised surfaces, inputs |
| `--surface-2` | `#1A1A1F` | `240 8% 11%` | hover, popovers |
| `--foreground` | `#E8E8EE` | `240 13% 92%` | body text |
| `--muted` | `#16161B` | `240 7% 10%` | muted bg |
| `--muted-foreground` | `#7A7A85` | `240 5% 50%` | secondary text |
| `--border-subtle` | `#1F1F25` | `240 8% 13%` | hairlines |
| `--border` | `#2A2A32` | `240 8% 18%` | inputs, dividers |
| `--accent` | `#F47168` | `5 88% 68%` | primary actions, brand |
| `--accent-foreground` | `#0A0A0C` | `240 7% 4%` | text on accent |
| `--success` | `#4ADE80` | `142 71% 58%` | published / active |
| `--warning` | `#F59E0B` | `38 92% 50%` | degraded / paused |
| `--danger` | `#EF4444` | `0 84% 60%` | rejected / killed |
| `--ring` | `#F47168` | `5 88% 68%` | focus ring (accent at lower opacity) |

### Typography

- **Sans:** Geist Sans (via `next/font/google`). Weights 400, 500, 600.
- **Mono:** Geist Mono (via `next/font/google`). Weights 400, 500.
- **Scale:**
  - `text-display`: 2rem / 1.1 / -0.02em — page H1, only one per page
  - `text-xl`: 1.25rem / 1.3 / -0.01em — section H2
  - `text-base`: 0.9375rem (15px) / 1.55 / 0 — body
  - `text-sm`: 0.8125rem (13px) / 1.4 — secondary
  - `text-xs`: 0.6875rem (11px) / 1.3 — label / meta (uppercase tracking-wide)
- **Mono usage:** IDs, dates, percentages, currency, raw JSON.

### Spacing & radius

- Base spacing scale: Tailwind defaults.
- Page gutter: `px-6` mobile, `px-8` desktop.
- Section gap: `space-y-8`.
- Card padding: `p-5`.
- Radius:
  - `rounded-md` (6px) — buttons, inputs
  - `rounded-lg` (8px) — cards
  - `rounded-xl` (12px) — modal-ish surfaces (reserved)
- Borders: 1px default. Use `--border-subtle` for hairlines between rows, `--border` for outlined inputs / cards.

### Motion

- Transitions: 150ms on `colors`, 200ms on `opacity` + `transform`.
- Hover: surfaces lift via `bg-surface-2` (no shadow), buttons brighten 8%.
- Focus: 2px ring in `--ring` at 60% opacity.
- No flashy entry animations on data-heavy pages.

---

## 2. Component catalog

All under `components/ui/`. Each is a thin, accessible primitive.

| Component | File | Notes |
|---|---|---|
| `Button` | `button.tsx` | variants: default, secondary, outline, ghost, destructive; sizes: sm, default, lg, icon |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | `card.tsx` | subtle border + rounded-lg |
| `Input` | `input.tsx` | replaces inline styling on `<input>` |
| `Textarea` | `textarea.tsx` | |
| `Label` | `label.tsx` | uppercase `text-xs tracking-wider` |
| `Badge` | `badge.tsx` | variants tied to status: default, success, warning, danger, muted |
| `Stat` | `stat.tsx` | large mono number + label, optional delta |
| `EmptyState` | `empty-state.tsx` | icon + heading + description + optional CTA |
| `Skeleton` | `skeleton.tsx` | pulse loader |
| `Separator` | `separator.tsx` | hairline divider |

## 3. Layout primitives

Under `components/layout/`:

| Component | File | Notes |
|---|---|---|
| `Nav` | `nav.tsx` | refined top nav: wordmark + section links + user pill + logout |
| `PageHeader` | `page-header.tsx` | `title`, optional `description`, slot for actions on the right |
| `Shell` | `shell.tsx` | wraps `<Nav>` + `<main>` with consistent gutters |

## 4. Status conventions

| Status | Badge variant | Token color |
|---|---|---|
| `draft` | muted | `--muted-foreground` |
| `pending` | warning | `--warning` |
| `published` / `active` | success | `--success` |
| `paused` | muted | `--muted-foreground` |
| `rejected` / `killed` | danger | `--danger` |
| `ended` | muted | `--muted-foreground` |

## 5. Charts

When Phase 8 lands (Recharts):
- Line color: `--accent` (single series) or accent + foreground+50% for two-series.
- Axes/labels: `--muted-foreground`, `text-xs`, mono numbers.
- Gridlines: `--border-subtle`.
- Tooltip: `surface-2` with `border-subtle`, rounded-md, mono numbers.

## 6. Asset display

Asset thumbnails: `aspect-[4/5]`, `object-cover`, `rounded-md`, `border-subtle`. Hover: `ring-1 ring-accent/40`.

## 7. Form patterns

- Labels above inputs, `text-xs` uppercase tracking-wider.
- Helper text under input, `text-xs text-muted-foreground`.
- Errors: `text-danger`, with same border on the input.
- Buttons right-aligned in a footer with `space-x-2`.
- For destructive actions: confirm via second click (no modal); button changes label `Remove → Confirm remove` for 3s.

## 8. Empty states

Per page: a single `<EmptyState>` block, with the page's primary CTA inline. Never a generic "no data" string in a sea of whitespace.

## 9. Accessibility

- All interactive elements: visible focus ring.
- Text contrast: ≥ 4.5:1 against background (verify foreground vs surface-2).
- Buttons get `aria-busy` while pending.
- Form fields: real `<label for>` association.

## 10. Future-phase usage

Each future plan (Plans 3-8) MUST:
- Use primitives from `components/ui/` rather than ad-hoc Tailwind on `<button>` / `<input>` / `<div>`.
- Use `PageHeader` + `Shell` instead of bespoke layout per page.
- Use the status badge convention for any state pill.
- Use mono for IDs, dates, currency, percentages.
