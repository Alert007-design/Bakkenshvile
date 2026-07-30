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
    // Bordbestillingens tests booter en indlejret Postgres (pglite/WASM) i en
    // beforeAll-hook. Boot + migrationer kan være langsomt i et koldt/sandkasse-
    // miljø, så både hook- og test-timeout hæves fra standardens 5–10 sek.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
