import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// Integration specs run against a real Postgres (DATABASE_URL). They create and delete
// their own throwaway users, so they never touch existing data — but they do need the
// database up, which is why they're separate from the default `npm test`.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${root}` }],
  },
  test: {
    include: ["lib/**/*.integration.test.ts"],
    environment: "node",
    // Shared database: serialise so concurrent files can't interleave writes.
    fileParallelism: false,
  },
});
