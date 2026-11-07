import {desktopAssets} from "./scripts/asset-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  publicDir: "public",
  resolve: { alias: { "@": fileURLToPath(new URL("../web", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  plugins: [react(), tailwindcss(), desktopAssets()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || "127.0.0.1", watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { copyPublicDir: false, target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14", sourcemap: !!process.env.TAURI_ENV_DEBUG },
});
