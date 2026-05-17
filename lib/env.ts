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
