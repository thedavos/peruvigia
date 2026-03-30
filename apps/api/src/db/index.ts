import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { requireDatabaseUrl } from "../env.js";
import { schema } from "./schema.js";

const databaseUrl = requireDatabaseUrl();

export const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle({
  client: pool,
  schema,
});
