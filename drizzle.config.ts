import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const envPath = process.env.DOTENV_CONFIG_PATH?.trim() || ".env.local";
config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(`DATABASE_URL is missing from ${envPath}`);
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
