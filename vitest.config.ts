import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    env: { NODE_ENV: "test" },
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    exclude: ["node_modules", ".next", ".worktrees/**", "dist", ".idea", ".git", ".cache"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
