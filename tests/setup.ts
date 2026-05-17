import "dotenv/config";
import { beforeAll, beforeEach, afterAll } from "vitest";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { sql, db } from "@/lib/db";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const UPLOAD_DIR = join(process.cwd(), "uploads");

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await sql`TRUNCATE TABLE sessions, external_calls, secrets, audit_log, llm_runs, ad_metric_daily, release_metric_daily, ads, audiences, campaigns, audience_seeds, releases, assets, artists, users RESTART IDENTITY CASCADE`;
  // Tests that write to uploads/ should not leak between runs.
  const files = await readdir(UPLOAD_DIR).catch(() => []);
  await Promise.all(
    files
      .filter((name) => name !== ".gitkeep")
      .map((name) => rm(join(UPLOAD_DIR, name), { force: true })),
  );
});

afterAll(async () => {
  await sql.end();
});
