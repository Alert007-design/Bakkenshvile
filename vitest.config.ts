import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Vitest-opsætning for bordbestillingssystemet. Understøtter samme "@/"-alias
// som Next.js (tsconfig paths), så tests kan importere med de samme stier som
// applikationskoden.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
