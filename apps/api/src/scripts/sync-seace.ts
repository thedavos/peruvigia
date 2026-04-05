import { pool } from "#api/db";
import { runSeaceSync } from "#api/modules/seace/service";

type CliOptions = {
  allowBackfill?: boolean;
  inputDir?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--input-dir" && next) {
      options.inputDir = next;
      index += 1;
      continue;
    }

    if (argument === "--allow-backfill") {
      options.allowBackfill = true;
    }
  }

  return options;
}

function printSummary(summary: Awaited<ReturnType<typeof runSeaceSync>>["summary"]) {
  console.log(
    [
      "SEACE sync summary",
      `downloaded=${summary.downloaded}`,
      `processed=${summary.processed}`,
      `inserted=${summary.inserted}`,
      `updated=${summary.updated}`,
      `reused=${summary.reused}`,
      `skipped=${summary.skipped}`,
      `failed=${summary.failed}`,
    ].join(" "),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSeaceSync(options);

  printSummary(result.summary);

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }

    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    console.error("SEACE sync failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
