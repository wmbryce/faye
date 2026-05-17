# Faye Plan 2 — Artist & Asset Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator can onboard an artist with assets, releases, and audience seeds via the web UI. CRUD-only; no campaigns or FB integration yet.

**Architecture:** Drizzle schema additions + Next.js server actions for mutations + protected pages for forms/lists. Local-disk asset storage under `./uploads/` (gitignored) — swap to S3-compat later. Settings page (placeholder from Phase 1) becomes the global API-keys editor for upcoming external clients.

**Tech Stack:** Inherited from Phase 1: TS 5.6, Next.js 15 (App Router) with server actions, Drizzle ORM, Postgres 15, Tailwind, shadcn/ui, Vitest. New: `mime-types`, `nanoid` (asset IDs), `formidable` or built-in `Request.formData()` for upload.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §5 (data model), §8 (web UI).

---

## File Structure

New / modified files:

```
faye/
  lib/db/schema.ts                   # MODIFY: add artist, asset, release, audience tables
  drizzle/0001_*.sql                 # generated
  uploads/.gitkeep                   # local asset store; uploads dir gitignored

  lib/
    artists/
      queries.ts                     # selectAll, byId, byNameOrId
      mutations.ts                   # create, update, archive
    releases/
      queries.ts
      mutations.ts
    assets/
      storage.ts                     # save buffer -> uploads/<id>.<ext>, return url
      queries.ts
      mutations.ts                   # upload, delete, label
    audiences/
      queries.ts                     # seed audiences live on artist; this is read/list
      mutations.ts                   # add/remove seed audience JSON specs

  app/
    artists/
      page.tsx                       # list
      new/page.tsx                   # create form
      [id]/
        page.tsx                     # detail
        edit/page.tsx                # update form
        assets/
          page.tsx                   # upload + list assets
          actions.ts                 # server actions for upload/delete
        releases/
          page.tsx                   # list releases for this artist
          new/page.tsx               # create release form
        audiences/
          page.tsx                   # list seed audiences
          new/page.tsx               # add audience seed (JSON editor)
    api/
      uploads/[file]/route.ts        # serve uploaded files (auth-gated)

  components/
    forms/
      artist-form.tsx                # shared create/edit form
      release-form.tsx
      audience-seed-form.tsx
      asset-upload.tsx
    artists/
      artist-card.tsx
      asset-grid.tsx

  tests/
    artists.test.ts                  # CRUD round-trip
    releases.test.ts
    assets.test.ts                   # upload buffer → file on disk → URL
    audiences.test.ts
```

---

### Task 1: Schema additions (artist, asset, release, audience)

**Files:**
- Modify: `lib/db/schema.ts`
- Generate: `drizzle/0001_*.sql`
- Test: `tests/artists.test.ts` (smoke)

- [ ] **Step 1: Extend `lib/db/schema.ts`** by appending these tables (keep existing `users` and `sessions`):

```ts
import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, date } from "drizzle-orm/pg-core";

export const artists = pgTable("artists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  spotifyArtistId: text("spotify_artist_id").notNull().unique(),
  timezone: text("timezone").notNull(),                 // IANA, e.g. "America/Denver"
  fbPageId: text("fb_page_id"),                          // nullable until FB linked
  voiceGuide: text("voice_guide").notNull().default(""),
  spotifyForArtistsToken: text("s4a_token"),             // nullable
  notes: text("notes").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["image", "video"] }).notNull(),
  url: text("url").notNull(),         // /api/uploads/<id>.<ext>
  label: text("label").notNull().default(""),
  bytes: integer("bytes").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const releases = pgTable("releases", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["track", "album"] }).notNull(),
  spotifyId: text("spotify_id").notNull().unique(),
  title: text("title").notNull(),
  releaseDate: date("release_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const audienceSeeds = pgTable("audience_seeds", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetingSpec: jsonb("targeting_spec").notNull(),  // FB targeting JSON
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Artist = typeof artists.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type AudienceSeed = typeof audienceSeeds.$inferSelect;
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```
Expected: `drizzle/0001_*.sql` with `CREATE TABLE artists ...` etc.

- [ ] **Step 3: Apply**

```bash
pnpm db:migrate
```

- [ ] **Step 4: Update `tests/setup.ts`** to also truncate the new tables. Replace the `beforeEach` body:

```ts
await sql`TRUNCATE TABLE sessions, audience_seeds, releases, assets, artists, users RESTART IDENTITY CASCADE`;
```

- [ ] **Step 5: Smoke test**

Create `tests/artists.test.ts` (replace whatever placeholder content exists):
```ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";

describe("artists schema", () => {
  it("inserts an artist", async () => {
    const [a] = await db.insert(artists).values({
      name: "Test Artist",
      spotifyArtistId: "spot_123",
      timezone: "America/Denver",
    }).returning();
    expect(a.name).toBe("Test Artist");
    expect(a.archived).toBe(false);
  });
});
```

Run: `pnpm test tests/artists.test.ts`. Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/ tests/
git commit -m "schema: artists, assets, releases, audience_seeds"
```

---

### Task 2: Artist queries + mutations

**Files:**
- Create: `lib/artists/queries.ts`
- Create: `lib/artists/mutations.ts`
- Create: `tests/artists.test.ts` (expand from smoke)

- [ ] **Step 1: Failing tests** — append to `tests/artists.test.ts`:

```ts
import { listArtists, getArtist, getArtistBySpotifyId } from "@/lib/artists/queries";
import { createArtist, updateArtist, archiveArtist } from "@/lib/artists/mutations";

describe("artist crud", () => {
  it("creates and lists", async () => {
    await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    await createArtist({ name: "B", spotifyArtistId: "s2", timezone: "UTC" });
    const rows = await listArtists();
    expect(rows.map((a) => a.name).sort()).toEqual(["A", "B"]);
  });

  it("gets by id and by spotify id", async () => {
    const a = await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    expect((await getArtist(a.id))?.name).toBe("A");
    expect((await getArtistBySpotifyId("s1"))?.id).toBe(a.id);
  });

  it("updates voice guide", async () => {
    const a = await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    await updateArtist(a.id, { voiceGuide: "warm + earnest" });
    expect((await getArtist(a.id))?.voiceGuide).toBe("warm + earnest");
  });

  it("archive hides from default list", async () => {
    const a = await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    await archiveArtist(a.id);
    expect((await listArtists()).find((x) => x.id === a.id)).toBeUndefined();
    expect((await listArtists({ includeArchived: true })).find((x) => x.id === a.id)).toBeTruthy();
  });
});
```

Run: `pnpm test tests/artists.test.ts`. Expected: FAIL (modules not found).

- [ ] **Step 2: `lib/artists/queries.ts`**

```ts
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, type Artist } from "@/lib/db/schema";

export async function listArtists(opts?: { includeArchived?: boolean }): Promise<Artist[]> {
  if (opts?.includeArchived) return db.select().from(artists);
  return db.select().from(artists).where(eq(artists.archived, false));
}

export async function getArtist(id: string): Promise<Artist | null> {
  const [a] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  return a ?? null;
}

export async function getArtistBySpotifyId(spotifyId: string): Promise<Artist | null> {
  const [a] = await db.select().from(artists).where(eq(artists.spotifyArtistId, spotifyId)).limit(1);
  return a ?? null;
}
```

- [ ] **Step 3: `lib/artists/mutations.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, type Artist } from "@/lib/db/schema";

type CreateInput = {
  name: string;
  spotifyArtistId: string;
  timezone: string;
  fbPageId?: string;
  voiceGuide?: string;
  notes?: string;
};

export async function createArtist(input: CreateInput): Promise<Artist> {
  const [row] = await db.insert(artists).values(input).returning();
  return row;
}

type UpdateInput = Partial<Omit<CreateInput, "spotifyArtistId">> & {
  spotifyForArtistsToken?: string | null;
};

export async function updateArtist(id: string, input: UpdateInput): Promise<void> {
  await db.update(artists).set(input).where(eq(artists.id, id));
}

export async function archiveArtist(id: string): Promise<void> {
  await db.update(artists).set({ archived: true }).where(eq(artists.id, id));
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/artists.test.ts
```
Expected: 5 passing (1 smoke + 4 crud).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "artist queries + mutations"
```

---

### Task 3: Artist pages (list, new, detail, edit)

**Files:**
- Create: `app/artists/page.tsx`
- Create: `app/artists/new/page.tsx`
- Create: `app/artists/[id]/page.tsx`
- Create: `app/artists/[id]/edit/page.tsx`
- Create: `components/forms/artist-form.tsx`
- Create: `app/artists/actions.ts` (server actions)

- [ ] **Step 1: Server actions** `app/artists/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createArtist, updateArtist, archiveArtist } from "@/lib/artists/mutations";

async function requireUser() {
  const u = await currentUser();
  if (!u) throw new Error("unauthorized");
}

export async function createArtistAction(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const spotifyArtistId = String(formData.get("spotifyArtistId") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Denver");
  const voiceGuide = String(formData.get("voiceGuide") ?? "");
  if (!name || !spotifyArtistId) throw new Error("name + spotifyArtistId required");
  const a = await createArtist({ name, spotifyArtistId, timezone, voiceGuide });
  revalidatePath("/artists");
  redirect(`/artists/${a.id}`);
}

export async function updateArtistAction(id: string, formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const voiceGuide = String(formData.get("voiceGuide") ?? "");
  const fbPageId = String(formData.get("fbPageId") ?? "") || undefined;
  await updateArtist(id, { name, timezone, voiceGuide, fbPageId });
  revalidatePath(`/artists/${id}`);
  redirect(`/artists/${id}`);
}

export async function archiveArtistAction(id: string) {
  await requireUser();
  await archiveArtist(id);
  revalidatePath("/artists");
  redirect("/artists");
}
```

- [ ] **Step 2: Shared form** `components/forms/artist-form.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import type { Artist } from "@/lib/db/schema";

export function ArtistForm({ initial, action, submitLabel }: {
  initial?: Partial<Artist>;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-md">
      <Field name="name" label="Artist name" required defaultValue={initial?.name ?? ""} />
      {!initial?.spotifyArtistId ? (
        <Field name="spotifyArtistId" label="Spotify artist ID" required />
      ) : (
        <input type="hidden" name="spotifyArtistId" value={initial.spotifyArtistId} />
      )}
      <Field name="timezone" label="Timezone (IANA)" defaultValue={initial?.timezone ?? "America/Denver"} required />
      <Field name="fbPageId" label="Facebook Page ID (optional)" defaultValue={initial?.fbPageId ?? ""} />
      <TextArea name="voiceGuide" label="Voice guide" defaultValue={initial?.voiceGuide ?? ""} rows={6} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function Field({ name, label, defaultValue, required }: any) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background"
      />
    </label>
  );
}

function TextArea({ name, label, defaultValue, rows }: any) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows ?? 4}
        className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-background"
      />
    </label>
  );
}
```

- [ ] **Step 3: Pages**

`app/artists/page.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { listArtists } from "@/lib/artists/queries";
import { Button } from "@/components/ui/button";

export default async function ArtistsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const rows = await listArtists();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Artists</h1>
          <Link href="/artists/new"><Button>New artist</Button></Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No artists yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {rows.map((a) => (
              <li key={a.id} className="p-4 hover:bg-muted">
                <Link href={`/artists/${a.id}`} className="font-medium">{a.name}</Link>
                <span className="ml-3 text-sm text-muted-foreground">{a.spotifyArtistId}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
```

`app/artists/new/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { ArtistForm } from "@/components/forms/artist-form";
import { createArtistAction } from "../actions";

export default async function NewArtistPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New artist</h1>
        <ArtistForm action={createArtistAction} submitLabel="Create artist" />
      </main>
    </>
  );
}
```

`app/artists/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";

export default async function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{artist.name}</h1>
          <Link href={`/artists/${artist.id}/edit`} className="text-sm underline">Edit</Link>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Spotify ID</dt><dd>{artist.spotifyArtistId}</dd>
          <dt className="text-muted-foreground">Timezone</dt><dd>{artist.timezone}</dd>
          <dt className="text-muted-foreground">FB page</dt><dd>{artist.fbPageId ?? "—"}</dd>
        </dl>
        <p className="text-sm whitespace-pre-wrap">{artist.voiceGuide || "(no voice guide)"}</p>
        <nav className="flex gap-4 pt-6">
          <Link href={`/artists/${artist.id}/assets`} className="text-sm underline">Assets</Link>
          <Link href={`/artists/${artist.id}/releases`} className="text-sm underline">Releases</Link>
          <Link href={`/artists/${artist.id}/audiences`} className="text-sm underline">Audience seeds</Link>
        </nav>
      </main>
    </>
  );
}
```

`app/artists/[id]/edit/page.tsx`:
```tsx
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { ArtistForm } from "@/components/forms/artist-form";
import { updateArtistAction } from "../../actions";

export default async function EditArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">Edit {artist.name}</h1>
        <ArtistForm
          initial={artist}
          action={updateArtistAction.bind(null, artist.id)}
          submitLabel="Save"
        />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Visual smoke** (manual; skip if running headless): `pnpm dev` → /artists → create flow.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add .
git commit -m "artist crud pages"
```

---

### Task 4: Asset upload + storage

**Files:**
- Create: `lib/assets/storage.ts`
- Create: `lib/assets/queries.ts`
- Create: `lib/assets/mutations.ts`
- Create: `app/api/uploads/[file]/route.ts`
- Create: `app/artists/[id]/assets/page.tsx`
- Create: `app/artists/[id]/assets/actions.ts`
- Create: `components/forms/asset-upload.tsx`
- Create: `components/artists/asset-grid.tsx`
- Create: `tests/assets.test.ts`
- Modify: `.gitignore` to include `uploads/`
- Create: `uploads/.gitkeep`

- [ ] **Step 1: Gitignore + uploads dir**

Append to `.gitignore`:
```
uploads/
!uploads/.gitkeep
```

Run: `mkdir -p uploads && touch uploads/.gitkeep`

- [ ] **Step 2: Storage util** `lib/assets/storage.ts`:

```ts
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function saveBuffer(args: {
  buffer: Buffer;
  contentType: string;
  origName: string;
}): Promise<{ filename: string; url: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = (extname(args.origName) || guessExt(args.contentType) || ".bin").toLowerCase();
  const id = randomBytes(16).toString("hex");
  const filename = `${id}${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), args.buffer);
  return { filename, url: `/api/uploads/${filename}` };
}

export async function deleteFile(filename: string): Promise<void> {
  await unlink(join(UPLOAD_DIR, filename)).catch(() => undefined);
}

export function uploadDir(): string {
  return UPLOAD_DIR;
}

function guessExt(ct: string): string | undefined {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
  };
  return map[ct];
}
```

- [ ] **Step 3: Queries + mutations** `lib/assets/queries.ts`:

```ts
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, type Asset } from "@/lib/db/schema";

export async function listAssets(artistId: string): Promise<Asset[]> {
  return db.select().from(assets).where(eq(assets.artistId, artistId)).orderBy(desc(assets.createdAt));
}

export async function getAsset(id: string): Promise<Asset | null> {
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return a ?? null;
}
```

`lib/assets/mutations.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, type Asset } from "@/lib/db/schema";
import { saveBuffer, deleteFile } from "./storage";
import { basename } from "node:path";

export async function uploadAsset(args: {
  artistId: string;
  file: { buffer: Buffer; contentType: string; origName: string; bytes: number };
  label?: string;
}): Promise<Asset> {
  const kind = args.file.contentType.startsWith("video/") ? "video" : "image";
  const { url } = await saveBuffer(args.file);
  const [row] = await db.insert(assets).values({
    artistId: args.artistId,
    kind,
    url,
    label: args.label ?? "",
    bytes: args.file.bytes,
    contentType: args.file.contentType,
  }).returning();
  return row;
}

export async function deleteAsset(id: string): Promise<void> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!row) return;
  await db.delete(assets).where(eq(assets.id, id));
  // url is `/api/uploads/<filename>`, take the filename
  const filename = basename(row.url);
  await deleteFile(filename);
}

export async function updateAssetLabel(id: string, label: string): Promise<void> {
  await db.update(assets).set({ label }).where(eq(assets.id, id));
}
```

- [ ] **Step 4: Upload-serving route** `app/api/uploads/[file]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { lookup } from "mime-types";
import { currentUser } from "@/lib/auth/current-user";
import { uploadDir } from "@/lib/assets/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { file } = await ctx.params;
  // path-traversal guard
  if (file.includes("/") || file.includes("..")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  try {
    const buf = await readFile(join(uploadDir(), file));
    const ct = lookup(file) || "application/octet-stream";
    return new NextResponse(buf, { headers: { "content-type": ct, "cache-control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
```

Add `mime-types`:
```bash
pnpm add mime-types
pnpm add -D @types/mime-types
```

- [ ] **Step 5: Tests** `tests/assets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { uploadAsset, deleteAsset } from "@/lib/assets/mutations";
import { listAssets } from "@/lib/assets/queries";
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

describe("assets", () => {
  it("uploads writes file and inserts row", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const buf = Buffer.from("PNGdata");
    const asset = await uploadAsset({
      artistId: a.id,
      file: { buffer: buf, contentType: "image/png", origName: "cover.png", bytes: buf.length },
      label: "cover",
    });
    expect(asset.kind).toBe("image");
    expect(asset.label).toBe("cover");
    expect(asset.url).toMatch(/^\/api\/uploads\/[0-9a-f]+\.png$/);
    const filename = basename(asset.url);
    const path = join(process.cwd(), "uploads", filename);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).toString()).toBe("PNGdata");
  });

  it("delete removes row and file", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const asset = await uploadAsset({
      artistId: a.id,
      file: { buffer: Buffer.from("x"), contentType: "image/png", origName: "x.png", bytes: 1 },
    });
    const filename = basename(asset.url);
    await deleteAsset(asset.id);
    const rows = await listAssets(a.id);
    expect(rows).toHaveLength(0);
    expect(existsSync(join(process.cwd(), "uploads", filename))).toBe(false);
  });
});
```

Run: `pnpm test tests/assets.test.ts`. Expected: 2 passing.

- [ ] **Step 6: Assets UI**

`app/artists/[id]/assets/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { uploadAsset, deleteAsset, updateAssetLabel } from "@/lib/assets/mutations";

const MAX_BYTES = 25 * 1024 * 1024;

export async function uploadAssetAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("no file");
  if (file.size > MAX_BYTES) throw new Error("file too large (25MB max)");
  const buf = Buffer.from(await file.arrayBuffer());
  await uploadAsset({
    artistId,
    file: { buffer: buf, contentType: file.type, origName: file.name, bytes: file.size },
    label: String(formData.get("label") ?? ""),
  });
  revalidatePath(`/artists/${artistId}/assets`);
}

export async function deleteAssetAction(artistId: string, assetId: string) {
  if (!(await currentUser())) throw new Error("unauthorized");
  await deleteAsset(assetId);
  revalidatePath(`/artists/${artistId}/assets`);
}

export async function updateAssetLabelAction(artistId: string, assetId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  await updateAssetLabel(assetId, String(formData.get("label") ?? ""));
  revalidatePath(`/artists/${artistId}/assets`);
}
```

`components/forms/asset-upload.tsx`:
```tsx
"use client";
import { useTransition } from "react";
import { uploadAssetAction } from "@/app/artists/[id]/assets/actions";
import { Button } from "@/components/ui/button";

export function AssetUpload({ artistId }: { artistId: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => uploadAssetAction(artistId, fd))}
      className="flex items-end gap-3 mb-6"
    >
      <label className="block">
        <span className="text-sm">File</span>
        <input name="file" type="file" required accept="image/*,video/*" className="block mt-1" />
      </label>
      <label className="block">
        <span className="text-sm">Label</span>
        <input name="label" className="block mt-1 h-9 px-3 border border-border rounded-md bg-background" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
    </form>
  );
}
```

`components/artists/asset-grid.tsx`:
```tsx
import Image from "next/image";
import type { Asset } from "@/lib/db/schema";

export function AssetGrid({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) return <p className="text-muted-foreground">No assets yet.</p>;
  return (
    <ul className="grid grid-cols-3 gap-4">
      {assets.map((a) => (
        <li key={a.id} className="border border-border rounded-md p-2 text-sm">
          {a.kind === "image" ? (
            <img src={a.url} alt={a.label} className="aspect-square object-cover w-full rounded" />
          ) : (
            <video src={a.url} className="aspect-square object-cover w-full rounded" />
          )}
          <p className="mt-2">{a.label || <span className="text-muted-foreground">(no label)</span>}</p>
        </li>
      ))}
    </ul>
  );
}
```

`app/artists/[id]/assets/page.tsx`:
```tsx
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { listAssets } from "@/lib/assets/queries";
import { AssetUpload } from "@/components/forms/asset-upload";
import { AssetGrid } from "@/components/artists/asset-grid";

export default async function AssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const assets = await listAssets(id);
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">{artist.name} — assets</h1>
        <AssetUpload artistId={id} />
        <AssetGrid assets={assets} />
      </main>
    </>
  );
}
```

- [ ] **Step 7: Run full test suite**

```bash
pnpm test
pnpm typecheck
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "asset upload + storage + UI"
```

---

### Task 5: Release queries + mutations + pages

**Files:**
- Create: `lib/releases/queries.ts`
- Create: `lib/releases/mutations.ts`
- Create: `app/artists/[id]/releases/page.tsx`
- Create: `app/artists/[id]/releases/new/page.tsx`
- Create: `app/artists/[id]/releases/actions.ts`
- Create: `components/forms/release-form.tsx`
- Create: `tests/releases.test.ts`

- [ ] **Step 1: TDD** Create `tests/releases.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { createRelease } from "@/lib/releases/mutations";
import { listReleases, getRelease } from "@/lib/releases/queries";

describe("releases", () => {
  it("creates and lists for artist", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    await createRelease({ artistId: a.id, kind: "track", spotifyId: "tr1", title: "Song", releaseDate: "2026-01-01" });
    await createRelease({ artistId: a.id, kind: "album", spotifyId: "al1", title: "LP", releaseDate: "2026-02-01" });
    const rows = await listReleases(a.id);
    expect(rows.map((r) => r.title).sort()).toEqual(["LP", "Song"]);
  });
});
```

Run: FAIL.

- [ ] **Step 2: `lib/releases/queries.ts`**

```ts
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases, type Release } from "@/lib/db/schema";

export async function listReleases(artistId: string): Promise<Release[]> {
  return db.select().from(releases).where(eq(releases.artistId, artistId)).orderBy(desc(releases.releaseDate));
}

export async function getRelease(id: string): Promise<Release | null> {
  const [r] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  return r ?? null;
}
```

- [ ] **Step 3: `lib/releases/mutations.ts`**

```ts
import { db } from "@/lib/db";
import { releases, type Release } from "@/lib/db/schema";

export async function createRelease(input: {
  artistId: string;
  kind: "track" | "album";
  spotifyId: string;
  title: string;
  releaseDate: string;  // YYYY-MM-DD
}): Promise<Release> {
  const [row] = await db.insert(releases).values(input).returning();
  return row;
}
```

- [ ] **Step 4: Pages + actions** (modeled on artists)

`app/artists/[id]/releases/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createRelease } from "@/lib/releases/mutations";

export async function createReleaseAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const kind = (formData.get("kind") === "album" ? "album" : "track") as "track" | "album";
  const spotifyId = String(formData.get("spotifyId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const releaseDate = String(formData.get("releaseDate") ?? "").trim();
  if (!spotifyId || !title || !releaseDate) throw new Error("missing fields");
  await createRelease({ artistId, kind, spotifyId, title, releaseDate });
  revalidatePath(`/artists/${artistId}/releases`);
  redirect(`/artists/${artistId}/releases`);
}
```

`components/forms/release-form.tsx`:
```tsx
import { Button } from "@/components/ui/button";

export function ReleaseForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4 max-w-md">
      <label className="block">
        <span className="text-sm">Kind</span>
        <select name="kind" className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background">
          <option value="track">Track</option>
          <option value="album">Album</option>
        </select>
      </label>
      <Field name="title" label="Title" required />
      <Field name="spotifyId" label="Spotify ID" required />
      <Field name="releaseDate" label="Release date" type="date" required />
      <Button type="submit">Create release</Button>
    </form>
  );
}

function Field({ name, label, type, required }: any) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        name={name}
        type={type ?? "text"}
        required={required}
        className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background"
      />
    </label>
  );
}
```

`app/artists/[id]/releases/page.tsx`:
```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { listReleases } from "@/lib/releases/queries";
import { Button } from "@/components/ui/button";

export default async function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const rows = await listReleases(id);
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">{artist.name} — releases</h1>
          <Link href={`/artists/${id}/releases/new`}><Button>New release</Button></Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No releases yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {rows.map((r) => (
              <li key={r.id} className="p-4">
                <span className="font-medium">{r.title}</span>
                <span className="ml-3 text-sm text-muted-foreground">{r.kind} · {r.releaseDate}</span>
                <span className="ml-3 text-xs text-muted-foreground">{r.spotifyId}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
```

`app/artists/[id]/releases/new/page.tsx`:
```tsx
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { ReleaseForm } from "@/components/forms/release-form";
import { createReleaseAction } from "../actions";

export default async function NewReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New release · {artist.name}</h1>
        <ReleaseForm action={createReleaseAction.bind(null, id)} />
      </main>
    </>
  );
}
```

- [ ] **Step 5: Test + commit**

```bash
pnpm test tests/releases.test.ts
pnpm typecheck
git add .
git commit -m "release crud + pages"
```

---

### Task 6: Audience seeds CRUD + UI

**Files:**
- Create: `lib/audiences/queries.ts`
- Create: `lib/audiences/mutations.ts`
- Create: `app/artists/[id]/audiences/page.tsx`
- Create: `app/artists/[id]/audiences/new/page.tsx`
- Create: `app/artists/[id]/audiences/actions.ts`
- Create: `components/forms/audience-seed-form.tsx`
- Create: `tests/audiences.test.ts`

Audience seeds are reusable FB targeting specs (JSON) attached to an artist. At campaign create (Phase 4) the operator picks subset of seeds → live ad-set audiences.

- [ ] **Step 1: TDD** `tests/audiences.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { createAudienceSeed, archiveAudienceSeed } from "@/lib/audiences/mutations";
import { listAudienceSeeds } from "@/lib/audiences/queries";

describe("audience seeds", () => {
  it("create + list filters archived", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const s = await createAudienceSeed({ artistId: a.id, name: "indie folk us25-44", targetingSpec: { interests: ["indie folk"], geo: { countries: ["US"] }, age_min: 25, age_max: 44 } });
    expect((await listAudienceSeeds(a.id)).map((x) => x.name)).toEqual(["indie folk us25-44"]);
    await archiveAudienceSeed(s.id);
    expect(await listAudienceSeeds(a.id)).toHaveLength(0);
  });

  it("rejects invalid targeting spec (zod)", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    await expect(
      createAudienceSeed({ artistId: a.id, name: "bad", targetingSpec: { wrongKey: 1 } as any })
    ).rejects.toThrow();
  });
});
```

Run: FAIL.

- [ ] **Step 2: Zod schema for targeting**

`lib/audiences/spec.ts`:
```ts
import { z } from "zod";

export const TargetingSpec = z.object({
  geo: z.object({
    countries: z.array(z.string().length(2)).min(1),
    cities: z.array(z.string()).optional(),
  }),
  age_min: z.number().int().min(13).max(65).optional(),
  age_max: z.number().int().min(13).max(65).optional(),
  interests: z.array(z.string()).optional(),
  lookalikes: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
});
export type TargetingSpec = z.infer<typeof TargetingSpec>;
```

- [ ] **Step 3: Queries + mutations**

`lib/audiences/queries.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { audienceSeeds, type AudienceSeed } from "@/lib/db/schema";

export async function listAudienceSeeds(artistId: string, opts?: { includeArchived?: boolean }): Promise<AudienceSeed[]> {
  if (opts?.includeArchived) {
    return db.select().from(audienceSeeds).where(eq(audienceSeeds.artistId, artistId));
  }
  return db.select().from(audienceSeeds).where(and(eq(audienceSeeds.artistId, artistId), eq(audienceSeeds.archived, false)));
}

export async function getAudienceSeed(id: string): Promise<AudienceSeed | null> {
  const [s] = await db.select().from(audienceSeeds).where(eq(audienceSeeds.id, id)).limit(1);
  return s ?? null;
}
```

`lib/audiences/mutations.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { audienceSeeds, type AudienceSeed } from "@/lib/db/schema";
import { TargetingSpec } from "./spec";

export async function createAudienceSeed(input: {
  artistId: string;
  name: string;
  targetingSpec: unknown;
}): Promise<AudienceSeed> {
  const spec = TargetingSpec.parse(input.targetingSpec);
  const [row] = await db.insert(audienceSeeds).values({
    artistId: input.artistId,
    name: input.name,
    targetingSpec: spec,
  }).returning();
  return row;
}

export async function archiveAudienceSeed(id: string): Promise<void> {
  await db.update(audienceSeeds).set({ archived: true }).where(eq(audienceSeeds.id, id));
}
```

- [ ] **Step 4: Pages + actions**

`app/artists/[id]/audiences/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createAudienceSeed, archiveAudienceSeed } from "@/lib/audiences/mutations";

export async function createSeedAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const name = String(formData.get("name") ?? "").trim();
  const rawJson = String(formData.get("targetingSpec") ?? "");
  let spec: unknown;
  try { spec = JSON.parse(rawJson); } catch { throw new Error("invalid JSON"); }
  await createAudienceSeed({ artistId, name, targetingSpec: spec });
  revalidatePath(`/artists/${artistId}/audiences`);
  redirect(`/artists/${artistId}/audiences`);
}

export async function archiveSeedAction(artistId: string, seedId: string) {
  if (!(await currentUser())) throw new Error("unauthorized");
  await archiveAudienceSeed(seedId);
  revalidatePath(`/artists/${artistId}/audiences`);
}
```

`components/forms/audience-seed-form.tsx`:
```tsx
import { Button } from "@/components/ui/button";

const PLACEHOLDER = `{
  "geo": { "countries": ["US", "CA"] },
  "age_min": 18,
  "age_max": 44,
  "interests": ["indie folk", "americana"]
}`;

export function AudienceSeedForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <label className="block">
        <span className="text-sm">Name</span>
        <input name="name" required className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background" />
      </label>
      <label className="block">
        <span className="text-sm">Targeting spec (JSON)</span>
        <textarea
          name="targetingSpec"
          required
          rows={12}
          placeholder={PLACEHOLDER}
          defaultValue={PLACEHOLDER}
          className="mt-1 w-full px-3 py-2 font-mono text-sm border border-border rounded-md bg-background"
        />
      </label>
      <Button type="submit">Add seed</Button>
    </form>
  );
}
```

`app/artists/[id]/audiences/page.tsx` and `new/page.tsx` — analogous to releases pages, calling `listAudienceSeeds` and rendering JSON via `<pre>`.

- [ ] **Step 5: Test + commit**

```bash
pnpm test
pnpm typecheck
git add .
git commit -m "audience seed crud + ui"
```

---

### Task 7: Home page now links to artists

Modify `app/page.tsx` to link to `/artists` instead of saying "No campaigns yet".

```tsx
export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p>
          <Link href="/artists" className="underline">Manage artists</Link>
        </p>
        <p className="text-muted-foreground">Campaigns dashboard coming in Phase 4.</p>
      </main>
    </>
  );
}
```

Commit: `home links to artists`.

---

## Done

After Task 7:
- Operator can create / edit / archive artists
- Upload assets (image/video) per artist, served auth-gated
- Create releases linked to artists
- Define reusable audience seeds (JSON targeting specs validated by Zod)
- Full test coverage on each unit
- `pnpm test` green; `pnpm typecheck` clean

**Next plan:** Plan 3 — External clients (FB / Feature.fm / Spotify / OpenRouter).
