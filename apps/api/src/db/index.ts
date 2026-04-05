import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { requireDatabaseUrl } from "#api/env.js";
import { schema } from "#api/db/schema.js";

const databaseUrl = requireDatabaseUrl();

export const pool = new Pool({
  connectionString: databaseUrl,
  idleTimeoutMillis: 5_000,
});

export const db = drizzle({
  client: pool,
  schema,
});
