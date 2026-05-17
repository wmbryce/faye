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
