import { pool } from "#api/db/index.js";
import { runContraloriaSync } from "#api/modules/contraloria/service.js";

type CliOptions = {
  allowBackfill?: boolean;
  inputDir?: string;
  reportUrl?: string;
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

    if (argument === "--report-url" && next) {
      options.reportUrl = next;
      index += 1;
      continue;
    }

    if (argument === "--allow-backfill") {
      options.allowBackfill = true;
    }
  }

  return options;
}

function printSummary(summary: Awaited<ReturnType<typeof runContraloriaSync>>["summary"]) {
  console.log(
    [
      "Contraloria sync summary",
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
  const result = await runContraloriaSync(options);

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
    console.error("Contraloria sync failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
