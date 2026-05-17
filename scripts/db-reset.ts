import "dotenv/config";
import { sql } from "@/lib/db";

await sql`TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE`;
await sql.end();
console.log("db reset");
