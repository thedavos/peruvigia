import { and, desc, eq, max, sql } from "drizzle-orm";

import { formatIsoDate, readRecordString } from "@peruvigia/shared";

import { db } from "#api/db/index.ts";
import { sourceRecords } from "#api/db/schema.ts";
import { normalizeSeaceDatasets } from "./normalize.ts";
import { persistSeaceRecords } from "./repository.ts";
import { acquireSeaceDatasets } from "./source.ts";
import {
  SEACE_SOURCE_TYPE,
  type SeaceAcquireOptions,
  type SeaceActivityFilters,
  type SeaceActivityRecord,
  type SeaceSyncResult,
} from "./types.ts";

type DatabaseClient = typeof db;

type SeaceServiceDependencies = {
  acquireDatasets?: typeof acquireSeaceDatasets;
  getLatestImportedObservedAt?: (databaseClient: DatabaseClient) => Promise<string | null>;
  normalizeDatasets?: typeof normalizeSeaceDatasets;
  persistRecords?: typeof persistSeaceRecords;
  recalculateAttentionProfiles?: (
    personIds: string[],
    databaseClient: DatabaseClient,
  ) => Promise<string[]>;
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

type SeaceActivitySourceRow = {
  importedAt: Date;
  normalizedPayload: Record<string, unknown> | null;
  observedAt: Date | null;
  sourceExternalId: string | null;
  sourceRecordId: string;
  sourceUrl: string | null;
};

function readRecordNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

export function mapSeaceAwardActivityRecord(
  row: SeaceActivitySourceRow,
): SeaceActivityRecord | null {
  if (!row.normalizedPayload) {
    return null;
  }

  const payload = row.normalizedPayload;
  const processExternalId = readRecordString(payload, "processExternalId");
  const supplierExternalId = readRecordString(payload, "supplierExternalId");
  const supplierName = readRecordString(payload, "supplierName");
  const contractingEntityExternalId = readRecordString(payload, "contractingEntityExternalId");
  const contractingEntityName = readRecordString(payload, "contractingEntityName");

  if (
    !processExternalId ||
    !supplierExternalId ||
    !supplierName ||
    !contractingEntityExternalId ||
    !contractingEntityName
  ) {
    return null;
  }

  return {
    awardedAt: readRecordString(payload, "awardedAt"),
    contractingEntity: {
      externalIdentifier: contractingEntityExternalId,
      name: contractingEntityName,
    },
    currency: readRecordString(payload, "currency"),
    objectDescription: readRecordString(payload, "objectDescription"),
    observedAt: row.observedAt?.toISOString() ?? row.importedAt.toISOString(),
    processExternalId,
    processType: readRecordString(payload, "processType"),
    sourceExternalId: row.sourceExternalId ?? row.sourceRecordId,
    sourceRecordId: row.sourceRecordId,
    sourceUrl: row.sourceUrl,
    status: readRecordString(payload, "status"),
    supplier: {
      documentNumber: readRecordString(payload, "supplierDocumentNumber"),
      externalIdentifier: supplierExternalId,
      name: supplierName,
    },
    totalAmount: readRecordNumber(payload, "totalAmount"),
  };
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

  return candidates.reduce<string>(
    (latestDate, candidate) => (candidate > latestDate ? candidate : latestDate),
    candidates[0]!,
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
  const recalculateProfiles =
    dependencies.recalculateAttentionProfiles ??
    (async (personIds, currentDatabaseClient) => {
      const module = await import("#api/modules/attention/service.ts");
      return await module.recalculateAttentionProfiles(personIds, currentDatabaseClient);
    });

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
  const affectedPersonIds = await recalculateProfiles(result.affectedPersonIds, databaseClient);

  return {
    affectedPersonIds,
    errors: [...normalized.errors, ...result.errors],
    summary: result.summary,
  };
}

export async function getSeaceActivity(
  filters: SeaceActivityFilters = {},
  databaseClient: DatabaseClient = db,
): Promise<SeaceActivityRecord[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conditions = [
    eq(sourceRecords.sourceType, SEACE_SOURCE_TYPE),
    eq(sourceRecords.sourceCategory, "awards"),
  ];

  if (filters.supplierDocumentNumber) {
    conditions.push(
      sql`${sourceRecords.normalizedPayload} ->> 'supplierDocumentNumber' = ${filters.supplierDocumentNumber}`,
    );
  }

  if (filters.supplierExternalId) {
    conditions.push(
      sql`${sourceRecords.normalizedPayload} ->> 'supplierExternalId' = ${filters.supplierExternalId}`,
    );
  }

  if (filters.contractingEntityExternalId) {
    conditions.push(
      sql`${sourceRecords.normalizedPayload} ->> 'contractingEntityExternalId' = ${filters.contractingEntityExternalId}`,
    );
  }

  if (filters.processExternalId) {
    conditions.push(
      sql`${sourceRecords.normalizedPayload} ->> 'processExternalId' = ${filters.processExternalId}`,
    );
  }

  const rows = await databaseClient
    .select({
      importedAt: sourceRecords.importedAt,
      normalizedPayload: sourceRecords.normalizedPayload,
      observedAt: sourceRecords.observedAt,
      sourceExternalId: sourceRecords.sourceExternalId,
      sourceRecordId: sourceRecords.id,
      sourceUrl: sourceRecords.sourceUrl,
    })
    .from(sourceRecords)
    .where(and(...conditions))
    .orderBy(desc(sourceRecords.observedAt), desc(sourceRecords.importedAt))
    .limit(limit);

  return rows
    .map(mapSeaceAwardActivityRecord)
    .filter((record): record is SeaceActivityRecord => record != null);
}

export { getIncomingObservedAt, getLatestImportedObservedAt };
