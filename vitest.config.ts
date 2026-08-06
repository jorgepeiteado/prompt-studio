import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sharedEntry = fileURLToPath(
  new URL("./packages/shared/src/index.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      "@promptstudio/shared": sharedEntry,
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx", "scripts/**/*.test.mjs"],
  },
});
