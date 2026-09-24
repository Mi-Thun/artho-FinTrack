import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path mapping in tsconfig.json. Matched as a regex on the `@/`
    // prefix specifically, so scoped packages like `@prisma/client` are left alone.
    alias: [{ find: /^@\//, replacement: `${root}` }],
  },
  test: {
    // Integration specs talk to a real Postgres, so they're excluded from the default
    // run and driven by `npm run test:integration` instead — `npm test` stays pure and
    // needs no database.
    include: ["lib/**/*.test.ts"],
    exclude: ["**/node_modules/**", "lib/**/*.integration.test.ts"],
    environment: "node",
  },
});
