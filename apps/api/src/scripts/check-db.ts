import { Client } from "pg";

import { requireDatabaseUrl } from "../env.js";

async function main() {
  const connectionString = requireDatabaseUrl();

  const client = new Client({
    connectionString,
  });

  await client.connect();

  const result = await client.query(`
    select
      current_database() as current_database,
      now() as server_time
  `);

  const [{ current_database: currentDatabase, server_time: serverTime }] = result.rows;
  const formattedServerTime =
    serverTime instanceof Date ? serverTime.toISOString() : String(serverTime);

  console.log(
    `PostgreSQL connection OK: database=${currentDatabase} server_time=${formattedServerTime}`,
  );

  await client.end();
}

void main().catch((error) => {
  console.error("PostgreSQL connection failed.");
  console.error(error);
  process.exit(1);
});
