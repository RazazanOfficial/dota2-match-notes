import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) } }, test: { include: ["packages/*/tests/**/*.test.ts", "apps/api/tests/**/*.test.ts", "apps/desktop/tests/**/*.test.{ts,tsx}"] } });
