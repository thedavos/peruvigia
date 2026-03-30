import { defineConfig } from "drizzle-kit";
import { requireDatabaseUrl } from "./src/env";

const databaseUrl = requireDatabaseUrl();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
