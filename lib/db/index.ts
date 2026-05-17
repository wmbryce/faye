import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const url = env().NODE_ENV === "test" ? env().DATABASE_URL_TEST : env().DATABASE_URL;

export const sql = postgres(url, { max: 10 });
export const db = drizzle(sql, { schema });
export { schema };
