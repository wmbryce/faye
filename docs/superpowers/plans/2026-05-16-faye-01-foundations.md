# Faye Plan 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Faye repo with Next.js + Postgres + Drizzle + magic-link auth so the operator (Michael) can log in and see an empty protected dashboard.

**Architecture:** Single TS monorepo. Next.js App Router serves UI + API. Drizzle ORM over `postgres-js` against local Postgres. Magic-link auth via Resend: HMAC-signed short-TTL tokens emailed to operator; verified token creates a DB-backed session bound to a signed httpOnly cookie. Middleware redirects unauthenticated requests to `/login`.

**Tech Stack:** TypeScript 5.6, Next.js 15 (App Router), React 19, Drizzle ORM, `postgres` (postgres-js), Tailwind CSS 3, shadcn/ui, Resend, Zod, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md`

---

## File Structure

Files created in this phase:

```
faye/
  .gitignore
  .nvmrc
  .env.example
  package.json
  pnpm-workspace.yaml             # single-package workspace; future-proofs split
  tsconfig.json
  next.config.mjs
  postcss.config.mjs
  tailwind.config.ts
  components.json                 # shadcn config
  drizzle.config.ts
  vitest.config.ts
  README.md
  middleware.ts                   # auth gate

  app/
    layout.tsx
    page.tsx                      # protected home
    globals.css
    login/page.tsx
    auth/verify/page.tsx
    settings/page.tsx
    api/
      health/route.ts
      auth/
        request/route.ts
        verify/route.ts
        logout/route.ts

  components/
    ui/button.tsx                 # shadcn-generated
    layout/nav.tsx

  lib/
    env.ts
    db/
      index.ts
      schema.ts
    email/
      client.ts
      templates/magic-link.tsx
    auth/
      tokens.ts
      sessions.ts
      current-user.ts

  drizzle/                        # drizzle-kit output
    0000_init.sql
    meta/_journal.json

  tests/
    setup.ts                      # DB reset + Resend mock
    tokens.test.ts
    sessions.test.ts
    auth.test.ts                  # integration: request → verify → /
    health.test.ts

  deploy/
    faye-web.service              # systemd unit example
    Caddyfile                     # reverse-proxy example

  scripts/
    db-reset.ts                   # truncate all tables (dev)
```

Each `lib/` module has one responsibility:
- `lib/db/` — connection + schema
- `lib/email/` — Resend transport + templates
- `lib/auth/tokens.ts` — magic-link token sign/verify (pure)
- `lib/auth/sessions.ts` — session row + cookie lifecycle
- `lib/auth/current-user.ts` — server-side cookie → user lookup

---

## Prerequisites

Operator has installed locally before starting:
- Node 22.x (matches `.nvmrc`)
- pnpm 9.x (`npm i -g pnpm`)
- Postgres 16 running locally (`brew install postgresql@16 && brew services start postgresql@16`)
- Created two empty DBs: `createdb faye_dev` and `createdb faye_test`
- Resend account + an API key in `.env`

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Init pnpm package**

Run:
```bash
cd /Users/williambryce/dev/faye
echo "22" > .nvmrc
```

Create `package.json`:
```json
{
  "name": "faye",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:reset": "tsx scripts/db-reset.ts"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "resend": "^4.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: next.config.mjs**

Create `next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {},
};
export default nextConfig;
```

- [ ] **Step 4: .gitignore**

Create `.gitignore`:
```
node_modules/
.next/
out/
.env
.env.local
*.log
.DS_Store
coverage/
.tsbuildinfo
.vercel
```

- [ ] **Step 5: .env.example**

Create `.env.example`:
```
# Postgres
DATABASE_URL=postgres://postgres@localhost:5432/faye_dev
DATABASE_URL_TEST=postgres://postgres@localhost:5432/faye_test

# Auth
AUTH_TOKEN_SECRET=replace-with-32-char-random
AUTH_COOKIE_SECRET=replace-with-32-char-random
OPERATOR_EMAIL=michael@wmbryce.dev

# Resend
RESEND_API_KEY=re_xxx
RESEND_FROM=Faye <faye@yourdomain.com>

# App
APP_URL=http://localhost:3000
NODE_ENV=development
```

- [ ] **Step 6: pnpm workspace marker**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - .
```

- [ ] **Step 7: Install + verify**

Run:
```bash
pnpm install
pnpm typecheck
```
Expected: install succeeds; typecheck passes (no source files yet — just config).

- [ ] **Step 8: Commit**

Run:
```bash
git add .
git commit -m "scaffold ts/next/drizzle deps"
```

---

### Task 2: Tailwind + shadcn/ui

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/globals.css`
- Create: `components.json`
- Create: `components/ui/button.tsx`

- [ ] **Step 1: Add Tailwind deps**

Run:
```bash
pnpm add -D tailwindcss@^3.4.0 postcss autoprefixer
pnpm add tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 2: tailwind.config.ts**

Create `tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

- [ ] **Step 3: postcss.config.mjs**

Create `postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: app/globals.css**

Create `app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 4%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --primary: 240 6% 10%;
    --primary-foreground: 0 0% 98%;
    --border: 240 6% 90%;
    --ring: 240 5% 65%;
    --radius: 0.5rem;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 5: components.json**

Create `components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui" }
}
```

- [ ] **Step 6: lib/utils.ts**

Create `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: components/ui/button.tsx**

Create `components/ui/button.tsx`:
```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3", lg: "h-10 px-6" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = "Button";
```

- [ ] **Step 8: Commit**

Run:
```bash
git add .
git commit -m "tailwind + shadcn button"
```

---

### Task 3: Env loader

**Files:**
- Create: `lib/env.ts`
- Create: `tests/env.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

describe("env parser", () => {
  it("parses a valid env object", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://x@y/z",
      DATABASE_URL_TEST: "postgres://x@y/z_test",
      AUTH_TOKEN_SECRET: "a".repeat(32),
      AUTH_COOKIE_SECRET: "b".repeat(32),
      OPERATOR_EMAIL: "ops@example.com",
      RESEND_API_KEY: "re_xxx",
      RESEND_FROM: "Faye <faye@example.com>",
      APP_URL: "http://localhost:3000",
      NODE_ENV: "development",
    });
    expect(env.OPERATOR_EMAIL).toBe("ops@example.com");
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects short AUTH_TOKEN_SECRET", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgres://x@y/z",
        DATABASE_URL_TEST: "postgres://x@y/z_test",
        AUTH_TOKEN_SECRET: "tooshort",
        AUTH_COOKIE_SECRET: "b".repeat(32),
        OPERATOR_EMAIL: "ops@example.com",
        RESEND_API_KEY: "re_xxx",
        RESEND_FROM: "Faye <faye@example.com>",
        APP_URL: "http://localhost:3000",
        NODE_ENV: "development",
      })
    ).toThrow();
  });

  it("rejects invalid OPERATOR_EMAIL", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgres://x@y/z",
        DATABASE_URL_TEST: "postgres://x@y/z_test",
        AUTH_TOKEN_SECRET: "a".repeat(32),
        AUTH_COOKIE_SECRET: "b".repeat(32),
        OPERATOR_EMAIL: "not-an-email",
        RESEND_API_KEY: "re_xxx",
        RESEND_FROM: "Faye <faye@example.com>",
        APP_URL: "http://localhost:3000",
        NODE_ENV: "development",
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Write minimal vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", setupFiles: [] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Run test to verify failure**

Run:
```bash
pnpm test tests/env.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/env'`.

- [ ] **Step 4: Implement env parser**

Create `lib/env.ts`:
```ts
import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url(),
  AUTH_TOKEN_SECRET: z.string().min(32),
  AUTH_COOKIE_SECRET: z.string().min(32),
  OPERATOR_EMAIL: z.string().email(),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]),
});

export type Env = z.infer<typeof Schema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  return Schema.parse(input);
}

let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 5: Run test to verify pass**

Run:
```bash
pnpm test tests/env.test.ts
```
Expected: 3 passing.

- [ ] **Step 6: Commit**

Run:
```bash
git add lib/env.ts tests/env.test.ts vitest.config.ts
git commit -m "typed env loader"
```

---

### Task 4: Drizzle + Postgres + initial schema

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `drizzle.config.ts`
- Create: `scripts/db-reset.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Schema for users + sessions**

Create `lib/db/schema.ts`:
```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 2: DB client**

Create `lib/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const url = env().NODE_ENV === "test" ? env().DATABASE_URL_TEST : env().DATABASE_URL;

export const sql = postgres(url, { max: 10 });
export const db = drizzle(sql, { schema });
export { schema };
```

- [ ] **Step 3: drizzle.config.ts**

Create `drizzle.config.ts`:
```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add `dotenv` dep:
```bash
pnpm add -D dotenv
```

- [ ] **Step 4: Generate migration**

Run:
```bash
cp .env.example .env
# edit .env: set real DATABASE_URL, fill AUTH_*_SECRET with `openssl rand -hex 32`
pnpm db:generate
```
Expected: `drizzle/0000_*.sql` created with `CREATE TABLE users` and `CREATE TABLE sessions`.

- [ ] **Step 5: Apply migration**

Run:
```bash
pnpm db:migrate
psql faye_dev -c '\d users'
```
Expected: tables exist.

- [ ] **Step 6: db-reset script**

Create `scripts/db-reset.ts`:
```ts
import { sql } from "@/lib/db";

await sql`TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE`;
await sql.end();
console.log("db reset");
```

Verify:
```bash
pnpm db:reset
```
Expected: prints `db reset`.

- [ ] **Step 7: Test setup file**

Create `tests/setup.ts`:
```ts
import "dotenv/config";
import { beforeAll, beforeEach, afterAll } from "vitest";
import { sql, db } from "@/lib/db";
import { migrate } from "drizzle-orm/postgres-js/migrator";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await sql`TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await sql.end();
});
```

Note: `dotenv/config` loads `.env` at the top so `process.env.OPERATOR_EMAIL`, `DATABASE_URL_TEST`, etc. are available before `@/lib/env` is first imported. Vitest sets `NODE_ENV=test` via the `env` option below, so `lib/db` picks `DATABASE_URL_TEST`.

Update `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    env: { NODE_ENV: "test" },
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 8: Add migrator dep**

Run:
```bash
pnpm add drizzle-orm@^0.36.0
# (already present — drizzle-orm/postgres-js/migrator ships with it)
```

- [ ] **Step 9: Smoke test the DB connection**

Create `tests/db.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

describe("db", () => {
  it("inserts and reads a user", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.c" }).returning();
    expect(u.email).toBe("a@b.c");
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
  });
});
```

Run:
```bash
pnpm test tests/db.test.ts
```
Expected: PASS.

- [ ] **Step 10: Commit**

Run:
```bash
git add .
git commit -m "drizzle + users/sessions schema"
```

---

### Task 5: Resend client + magic-link template

**Files:**
- Create: `lib/email/client.ts`
- Create: `lib/email/templates/magic-link.tsx`
- Create: `tests/email.test.ts`

- [ ] **Step 1: Add react-email deps**

Run:
```bash
pnpm add @react-email/components
pnpm add -D @react-email/render
```

- [ ] **Step 2: Magic-link template**

Create `lib/email/templates/magic-link.tsx`:
```tsx
import { Html, Body, Container, Heading, Text, Button } from "@react-email/components";

export function MagicLinkEmail({ url }: { url: string }) {
  return (
    <Html>
      <Body style={{ fontFamily: "system-ui", padding: 24 }}>
        <Container>
          <Heading>Sign in to Faye</Heading>
          <Text>Click below to sign in. Link expires in 10 minutes.</Text>
          <Button href={url} style={{ background: "#111", color: "#fff", padding: "10px 16px", borderRadius: 6 }}>
            Sign in
          </Button>
          <Text style={{ color: "#666", marginTop: 16 }}>Or copy: {url}</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Write failing test**

Create `tests/email.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null }) },
  })),
}));

import { sendMagicLink } from "@/lib/email/client";

describe("sendMagicLink", () => {
  it("returns message id on success", async () => {
    const id = await sendMagicLink({ to: "a@b.c", url: "https://x/y" });
    expect(id).toBe("msg_1");
  });
});
```

Run:
```bash
pnpm test tests/email.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement client**

Create `lib/email/client.ts`:
```ts
import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import { MagicLinkEmail } from "./templates/magic-link";

const resend = new Resend(env().RESEND_API_KEY);

export async function sendMagicLink(args: { to: string; url: string }): Promise<string> {
  const html = await render(MagicLinkEmail({ url: args.url }));
  const { data, error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to: args.to,
    subject: "Sign in to Faye",
    html,
  });
  if (error) throw new Error(`resend send failed: ${error.message}`);
  if (!data?.id) throw new Error("resend returned no id");
  return data.id;
}
```

- [ ] **Step 5: Run test to verify pass**

Run:
```bash
pnpm test tests/email.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

Run:
```bash
git add .
git commit -m "resend magic-link sender"
```

---

### Task 6: Token utils (HMAC magic-link)

**Files:**
- Create: `lib/auth/tokens.ts`
- Create: `tests/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "@/lib/auth/tokens";

const SECRET = "a".repeat(32);

describe("tokens", () => {
  it("roundtrip", async () => {
    const token = await signToken({ payload: { sub: "user@x" }, ttlMs: 10_000, secret: SECRET });
    const v = await verifyToken({ token, secret: SECRET });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload.sub).toBe("user@x");
  });

  it("rejects tampered token", async () => {
    const token = await signToken({ payload: { sub: "user@x" }, ttlMs: 10_000, secret: SECRET });
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    const v = await verifyToken({ token: tampered, secret: SECRET });
    expect(v.ok).toBe(false);
  });

  it("rejects expired token", async () => {
    const token = await signToken({ payload: { sub: "user@x" }, ttlMs: -1, secret: SECRET });
    const v = await verifyToken({ token, secret: SECRET });
    expect(v.ok).toBe(false);
  });
});
```

Run:
```bash
pnpm test tests/tokens.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 2: Implement tokens**

Create `lib/auth/tokens.ts`:
```ts
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

type Payload = Record<string, string | number>;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}
function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export async function signToken(args: {
  payload: Payload;
  ttlMs: number;
  secret: string;
}): Promise<string> {
  const exp = Date.now() + args.ttlMs;
  const nonce = randomBytes(8).toString("base64url");
  const body = b64url(JSON.stringify({ ...args.payload, exp, nonce }));
  const sig = hmac(args.secret, body);
  return `${body}.${sig}`;
}

export type VerifyResult<P = Payload> =
  | { ok: true; payload: P & { exp: number; nonce: string } }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export async function verifyToken<P = Payload>(args: {
  token: string;
  secret: string;
}): Promise<VerifyResult<P>> {
  const [body, sig] = args.token.split(".");
  if (!body || !sig) return { ok: false, reason: "malformed" };
  const expected = hmac(args.secret, body);
  const a = b64urlDecode(sig);
  const b = b64urlDecode(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  let parsed: P & { exp: number; nonce: string };
  try {
    parsed = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, payload: parsed };
}
```

- [ ] **Step 3: Run test to verify pass**

Run:
```bash
pnpm test tests/tokens.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

Run:
```bash
git add .
git commit -m "hmac magic-link tokens"
```

---

### Task 7: Session utils (DB-backed cookie)

**Files:**
- Create: `lib/auth/sessions.ts`
- Create: `tests/sessions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/sessions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, verifySessionToken, destroySession } from "@/lib/auth/sessions";

describe("sessions", () => {
  it("creates and verifies", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.c" }).returning();
    const { token } = await createSession({ userId: u.id });
    const s = await verifySessionToken(token);
    expect(s?.userId).toBe(u.id);
  });

  it("returns null for bogus token", async () => {
    const s = await verifySessionToken("not-a-real-token");
    expect(s).toBeNull();
  });

  it("returns null after destroy", async () => {
    const [u] = await db.insert(users).values({ email: "a@b.c" }).returning();
    const { token } = await createSession({ userId: u.id });
    await destroySession(token);
    const s = await verifySessionToken(token);
    expect(s).toBeNull();
  });
});
```

Run:
```bash
pnpm test tests/sessions.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Implement sessions**

Create `lib/auth/sessions.ts`:
```ts
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(args: { userId: string }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId: args.userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function verifySessionToken(token: string) {
  const tokenHash = hashToken(token);
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt };
}

export async function destroySession(token: string) {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export const SESSION_COOKIE_NAME = "faye_session";
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_MS / 1000;
```

- [ ] **Step 3: Run test to verify pass**

Run:
```bash
pnpm test tests/sessions.test.ts
```
Expected: 3 passing.

- [ ] **Step 4: Commit**

Run:
```bash
git add .
git commit -m "db-backed session lifecycle"
```

---

### Task 8: Auth API routes (request, verify, logout)

**Files:**
- Create: `app/api/auth/request/route.ts`
- Create: `app/api/auth/verify/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `tests/auth.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const sendMagicLinkMock = vi.fn().mockResolvedValue("msg_1");
vi.mock("@/lib/email/client", () => ({ sendMagicLink: (a: any) => sendMagicLinkMock(a) }));

import { POST as requestPOST } from "@/app/api/auth/request/route";
import { GET as verifyGET } from "@/app/api/auth/verify/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessions";

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("auth", () => {
  it("request: rejects non-operator email", async () => {
    const res = await requestPOST(
      makeReq("http://x/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: "nope@x.com" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("request: emails the operator a link", async () => {
    sendMagicLinkMock.mockClear();
    const res = await requestPOST(
      makeReq("http://x/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: process.env.OPERATOR_EMAIL }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    expect(sendMagicLinkMock).toHaveBeenCalledOnce();
    const url = sendMagicLinkMock.mock.calls[0][0].url as string;
    expect(url).toContain("/api/auth/verify?token=");
  });

  it("verify: rejects bad token", async () => {
    const res = await verifyGET(makeReq("http://x/api/auth/verify?token=bogus"));
    expect(res.status).toBe(401);
  });

  it("verify: with valid token creates user + session + redirects", async () => {
    sendMagicLinkMock.mockClear();
    await requestPOST(
      makeReq("http://x/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: process.env.OPERATOR_EMAIL }),
        headers: { "content-type": "application/json" },
      })
    );
    const url = sendMagicLinkMock.mock.calls[0][0].url as string;
    const res = await verifyGET(makeReq(url));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    const rows = await db.select().from(users).where(eq(users.email, process.env.OPERATOR_EMAIL!));
    expect(rows).toHaveLength(1);
  });

  it("logout: clears cookie", async () => {
    const res = await logoutPOST(makeReq("http://x/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });
});
```

Run:
```bash
pnpm test tests/auth.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement /api/auth/request**

Create `app/api/auth/request/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { signToken } from "@/lib/auth/tokens";
import { sendMagicLink } from "@/lib/email/client";

const Body = z.object({ email: z.string().email() });
const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (body.data.email.toLowerCase() !== env().OPERATOR_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const token = await signToken({
    payload: { sub: body.data.email },
    ttlMs: MAGIC_LINK_TTL_MS,
    secret: env().AUTH_TOKEN_SECRET,
  });
  const url = `${env().APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMagicLink({ to: body.data.email, url });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Implement /api/auth/verify**

Create `app/api/auth/verify/route.ts`:
```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { verifyToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth/sessions";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
  const v = await verifyToken<{ sub: string }>({ token, secret: env().AUTH_TOKEN_SECRET });
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });
  const email = v.payload.sub.toLowerCase();
  if (email !== env().OPERATOR_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email }).returning();
  const { token: sessionToken, expiresAt } = await createSession({ userId: user.id });
  const res = NextResponse.redirect(new URL("/", env().APP_URL));
  res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
    expires: expiresAt,
  });
  return res;
}
```

- [ ] **Step 4: Implement /api/auth/logout**

Create `app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE_NAME } from "@/lib/auth/sessions";

function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function POST(req: Request) {
  const token = readSessionCookie(req);
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 5: Run test to verify pass**

Run:
```bash
pnpm test tests/auth.test.ts
```
Expected: 5 passing.

- [ ] **Step 6: Commit**

Run:
```bash
git add .
git commit -m "auth api routes"
```

---

### Task 9: Current-user helper + middleware

**Files:**
- Create: `lib/auth/current-user.ts`
- Create: `middleware.ts`

- [ ] **Step 1: current-user helper**

Create `lib/auth/current-user.ts`:
```ts
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./sessions";

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const s = await verifySessionToken(token);
  if (!s) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
  return u ?? null;
}
```

- [ ] **Step 2: middleware**

Create `middleware.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/request", "/api/auth/verify", "/api/health"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.get("faye_session")?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

(Note: middleware does cookie-presence check only — DB lookup happens server-side in route handlers / pages via `currentUser()`. Edge runtime can't reach Postgres directly.)

- [ ] **Step 3: Commit**

Run:
```bash
git add .
git commit -m "current-user + route protection"
```

---

### Task 10: Login page UI

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Login page**

Create `app/login/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/auth/request", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: { "content-type": "application/json" },
    });
    setState(res.ok ? "sent" : "error");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Sign in to Faye</h1>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full h-9 px-3 border border-border rounded-md bg-background"
        />
        <Button type="submit" disabled={state === "sending"} className="w-full">
          {state === "sending" ? "Sending…" : "Send magic link"}
        </Button>
        {state === "sent" && <p className="text-sm text-muted-foreground">Check your email.</p>}
        {state === "error" && <p className="text-sm text-red-600">Something went wrong.</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Visual smoke test**

Run:
```bash
pnpm dev
```
Open `http://localhost:3000/login`. Expected: form renders, "Send magic link" button works (hitting your real Resend), email arrives, clicking link signs you in and lands on `/` (which still 404s — fixed next task).

- [ ] **Step 3: Commit**

Run:
```bash
git add .
git commit -m "login page"
```

---

### Task 11: Root layout + nav + home + settings placeholder

**Files:**
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/settings/page.tsx`
- Create: `components/layout/nav.tsx`

- [ ] **Step 1: Root layout**

Create `app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Faye", description: "FB ads for Spotify listens" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Nav**

Create `components/layout/nav.tsx`:
```tsx
"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Nav({ email }: { email: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <nav className="border-b border-border">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold">Faye</Link>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">Settings</Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{email}</span>
          <Button variant="outline" size="sm" onClick={logout}>Log out</Button>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Home**

Create `app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-2">Campaigns</h1>
        <p className="text-muted-foreground">No campaigns yet.</p>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Settings placeholder**

Create `app/settings/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-4">Settings</h1>
        <p className="text-muted-foreground">Coming soon — review delay, K/N, weights, API keys.</p>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Visual smoke test**

Run:
```bash
pnpm dev
```
- Open `http://localhost:3000/` while signed out → redirects to `/login`.
- Sign in via magic link → lands on `/` showing "No campaigns yet."
- Click "Settings" → lands on `/settings`.
- Click "Log out" → returns to `/login`.

- [ ] **Step 6: Commit**

Run:
```bash
git add .
git commit -m "layout, nav, home, settings"
```

---

### Task 12: Health check + final wiring

**Files:**
- Create: `app/api/health/route.ts`
- Create: `tests/health.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/health.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health", () => {
  it("returns ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

Run:
```bash
pnpm test tests/health.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Implement health**

Create `app/api/health/route.ts`:
```ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Run all tests**

Run:
```bash
pnpm test
```
Expected: all tests passing across `env`, `db`, `email`, `tokens`, `sessions`, `auth`, `health`.

- [ ] **Step 4: Typecheck**

Run:
```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

Run:
```bash
git add .
git commit -m "health check + green test suite"
```

---

### Task 13: Deploy artifacts + README

**Files:**
- Create: `deploy/faye-web.service`
- Create: `deploy/Caddyfile`
- Create: `README.md`

- [ ] **Step 1: systemd unit**

Create `deploy/faye-web.service`:
```ini
[Unit]
Description=Faye web (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=faye
WorkingDirectory=/opt/faye
EnvironmentFile=/opt/faye/.env
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Caddyfile**

Create `deploy/Caddyfile`:
```
faye.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
    encode zstd gzip
}
```

- [ ] **Step 3: README**

Create `README.md`:
```markdown
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
```

- [ ] **Step 4: Commit**

Run:
```bash
git add .
git commit -m "deploy artifacts + readme"
```

---

## Done

After Task 13 you have:
- Working Next.js app on `http://localhost:3000`
- Operator can sign in via magic-link email
- Protected `/`, `/settings`; public `/login`, `/api/auth/*`, `/api/health`
- Drizzle migrations applied; `users` + `sessions` tables exist
- `pnpm test` green across env, db, email, tokens, sessions, auth, health
- Deploy artifacts (systemd unit, Caddyfile) checked in
- README documents local setup + deploy

Next plan: **Plan 2 — Artist & asset management.** Write it after this phase ships.
