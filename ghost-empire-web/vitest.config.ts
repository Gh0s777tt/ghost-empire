import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> "./src/*" path alias so tests import like app code.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
