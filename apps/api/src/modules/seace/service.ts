import { eq, max } from "drizzle-orm";

import { formatIsoDate } from "@peruvigia/shared";

import { db } from "#api/db/index.js";
import { sourceRecords } from "#api/db/schema.js";
import { normalizeSeaceDatasets } from "./normalize.js";
import { persistSeaceRecords } from "./repository.js";
import { acquireSeaceDatasets } from "./source.js";
import { SEACE_SOURCE_TYPE, type SeaceAcquireOptions, type SeaceSyncResult } from "./types.js";

type DatabaseClient = typeof db;

type SeaceServiceDependencies = {
  acquireDatasets?: typeof acquireSeaceDatasets;
  getLatestImportedObservedAt?: (databaseClient: DatabaseClient) => Promise<string | null>;
  normalizeDatasets?: typeof normalizeSeaceDatasets;
  persistRecords?: typeof persistSeaceRecords;
};

async function getLatestImportedObservedAt(databaseClient: DatabaseClient) {
  const [result] = await databaseClient
    .select({
      latestObservedAt: max(sourceRecords.observedAt),
    })
    .from(sourceRecords)
    .where(eq(sourceRecords.sourceType, SEACE_SOURCE_TYPE));

  return result?.latestObservedAt ? formatIsoDate(result.latestObservedAt) : null;
}

function getIncomingObservedAt(
  normalized: ReturnType<typeof normalizeSeaceDatasets>,
): string | null {
  const candidates = [
    ...normalized.rnpLinks.map((link) => link.observedAt),
    ...normalized.awards
      .map((award) => award.awardedAt)
      .filter((awardedAt): awardedAt is string => awardedAt != null),
  ];

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce<string>((latestDate, candidate) =>
    candidate > latestDate ? candidate : latestDate,
  );
}

export async function runSeaceSync(
  options: SeaceAcquireOptions = {},
  databaseClient: DatabaseClient = db,
  dependencies: SeaceServiceDependencies = {},
): Promise<SeaceSyncResult> {
  const acquireDatasets = dependencies.acquireDatasets ?? acquireSeaceDatasets;
  const normalizeDatasets = dependencies.normalizeDatasets ?? normalizeSeaceDatasets;
  const persistRecords = dependencies.persistRecords ?? persistSeaceRecords;
  const readLatestImportedObservedAt =
    dependencies.getLatestImportedObservedAt ?? getLatestImportedObservedAt;

  const datasets = await acquireDatasets(options);
  const normalized = normalizeDatasets(datasets);

  const incomingObservedAt = getIncomingObservedAt(normalized);
  const latestImportedObservedAt = await readLatestImportedObservedAt(databaseClient);

  if (
    !options.allowBackfill &&
    incomingObservedAt &&
    latestImportedObservedAt &&
    incomingObservedAt < latestImportedObservedAt
  ) {
    throw new Error(
      `Refusing to import SEACE records dated ${incomingObservedAt} because the latest imported SEACE evidence is ${latestImportedObservedAt}. Re-run with --allow-backfill if you intentionally want to import older data.`,
    );
  }

  const result = await persistRecords(
    {
      awards: normalized.awards,
      contractingEntities: normalized.contractingEntities,
      rnpLinks: normalized.rnpLinks,
    },
    {
      databaseClient,
      initialSummary: {
        downloaded: datasets.length,
        skipped: normalized.skipped,
      },
    },
  );

  return {
    errors: [...normalized.errors, ...result.errors],
    summary: result.summary,
  };
}

export { getIncomingObservedAt, getLatestImportedObservedAt };
