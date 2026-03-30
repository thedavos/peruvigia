import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "../db/index.js";
import { requireDatabaseUrl } from "../env.js";

requireDatabaseUrl();

async function main() {
  await migrate(db, {
    migrationsFolder: "drizzle",
  });

  console.log("PostgreSQL migrations applied successfully.");
}

void main()
  .catch((error) => {
    console.error("PostgreSQL migration failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
