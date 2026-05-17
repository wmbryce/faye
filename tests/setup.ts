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
