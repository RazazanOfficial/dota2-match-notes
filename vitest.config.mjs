import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) } }, test: { testTimeout: 30000, include: ["packages/*/tests/**/*.test.ts", "apps/api/tests/**/*.test.ts", "apps/desktop/tests/**/*.test.{ts,tsx}"] } });
