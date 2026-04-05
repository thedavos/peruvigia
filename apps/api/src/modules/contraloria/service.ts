import { eq, max, type InferSelectModel } from "drizzle-orm";

import {
  ContraloriaStatusResponseSchema,
  formatIsoDate,
  readRecordString,
  type ContraloriaSignalType,
  type ContraloriaStatusResponse,
  type ContraloriaStatusSignal,
} from "@peruvigia/shared";

import { db } from "#api/db/index.ts";
import { people, signals, sourceRecords } from "#api/db/schema.ts";
import { CONTRALORIA_SOURCE_TYPE } from "./types.ts";
import { persistContraloriaRecords } from "./repository.ts";
import { acquireContraloriaAttachments } from "./source.ts";
import { normalizeParsedRow, parseAttachmentRows } from "./workbook.ts";
import type { AcquireOptions, ContraloriaSyncResult, NormalizedSanctionRecord } from "./types.ts";

type DatabaseClient = typeof db;

type ContraloriaServiceDependencies = {
  acquireAttachments?: typeof acquireContraloriaAttachments;
  getLatestImportedReportDate?: (databaseClient: DatabaseClient) => Promise<string | null>;
  normalizeRow?: typeof normalizeParsedRow;
  parseRows?: typeof parseAttachmentRows;
  persistRecords?: typeof persistContraloriaRecords;
  recalculateAttentionProfiles?: (
    personIds: string[],
    databaseClient: DatabaseClient,
  ) => Promise<string[]>;
};

async function getLatestImportedReportDate(databaseClient: DatabaseClient) {
  const [result] = await databaseClient
    .select({
      latestObservedAt: max(sourceRecords.observedAt),
    })
    .from(sourceRecords)
    .where(eq(sourceRecords.sourceType, CONTRALORIA_SOURCE_TYPE));

  return result?.latestObservedAt ? formatIsoDate(result.latestObservedAt) : null;
}

function getIncomingReportDate(records: NormalizedSanctionRecord[]) {
  if (records.length === 0) {
    return null;
  }

  return records.reduce<string>(
    (latestDate, record) => (record.reportDate > latestDate ? record.reportDate : latestDate),
    records[0]!.reportDate,
  );
}

function toStatusSignal(signal: InferSelectModel<typeof signals>): ContraloriaStatusSignal {
  const metadata = signal.metadata;
  return {
    attachmentUrl: readRecordString(metadata, "attachmentUrl") ?? "",
    canonicalKey: readRecordString(metadata, "canonicalKey") ?? signal.id,
    endDate: readRecordString(metadata, "endDate"),
    entityName: readRecordString(metadata, "entityName"),
    isActive: signal.isActive,
    reportUrl: readRecordString(metadata, "reportUrl") ?? "",
    resolutionDate: readRecordString(metadata, "resolutionDate"),
    resolutionNumber: readRecordString(metadata, "resolutionNumber"),
    sanctionType: readRecordString(metadata, "sanctionType") ?? signal.signalType,
    signalId: signal.id,
    signalType: signal.signalType as ContraloriaSignalType,
    sourceRecordId: signal.sourceRecordId,
    startDate: readRecordString(metadata, "startDate"),
    summary: signal.summary,
    title: signal.title,
  };
}

export async function runContraloriaSync(
  options: AcquireOptions,
  databaseClient: DatabaseClient = db,
  dependencies: ContraloriaServiceDependencies = {},
): Promise<ContraloriaSyncResult> {
  const acquireAttachments = dependencies.acquireAttachments ?? acquireContraloriaAttachments;
  const normalizeRow = dependencies.normalizeRow ?? normalizeParsedRow;
  const parseRows = dependencies.parseRows ?? parseAttachmentRows;
  const persistRecords = dependencies.persistRecords ?? persistContraloriaRecords;
  const readLatestImportedReportDate =
    dependencies.getLatestImportedReportDate ?? getLatestImportedReportDate;
  const recalculateProfiles =
    dependencies.recalculateAttentionProfiles ??
    (async (personIds, currentDatabaseClient) => {
      const module = await import("#api/modules/attention/service.ts");
      return await module.recalculateAttentionProfiles(personIds, currentDatabaseClient);
    });

  const attachments = await acquireAttachments(options);
  const normalizedRecords: NormalizedSanctionRecord[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const attachment of attachments) {
    const parsedRows = await parseRows(attachment);

    for (const row of parsedRows) {
      const normalizedRow = normalizeRow(row);
      if (!normalizedRow) {
        skipped += 1;
        continue;
      }

      normalizedRecords.push(normalizedRow);
    }
  }

  const incomingReportDate = getIncomingReportDate(normalizedRecords);
  const latestImportedReportDate = await readLatestImportedReportDate(databaseClient);

  if (
    !options.allowBackfill &&
    incomingReportDate &&
    latestImportedReportDate &&
    incomingReportDate < latestImportedReportDate
  ) {
    throw new Error(
      `Refusing to import Contraloria report dated ${incomingReportDate} because the latest imported report is ${latestImportedReportDate}. Re-run with --allow-backfill if you intentionally want to import an older publication.`,
    );
  }

  const result = await persistRecords(normalizedRecords, {
    databaseClient,
    initialSummary: {
      downloaded: attachments.length,
      skipped,
    },
  });
  const affectedPersonIds = await recalculateProfiles(result.affectedPersonIds, databaseClient);

  errors.push(...result.errors);

  return {
    affectedPersonIds,
    errors,
    summary: result.summary,
  };
}

export async function getContraloriaStatus(
  personId: string,
  databaseClient: DatabaseClient = db,
): Promise<ContraloriaStatusResponse | null> {
  const [person] = await databaseClient
    .select({
      id: people.id,
    })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);

  if (!person) {
    return null;
  }

  const personSignals = (
    await databaseClient.select().from(signals).where(eq(signals.personId, personId))
  ).filter((signal) => {
    const reference = signal.metadata.reference;
    if (!reference || typeof reference !== "object" || !("sourceType" in reference)) {
      return false;
    }

    return (reference as { sourceType?: unknown }).sourceType === "contraloria_sanciones";
  });

  const activeSignals = personSignals.filter((signal) => signal.isActive).map(toStatusSignal);
  const contextSignals = personSignals.filter((signal) => !signal.isActive).map(toStatusSignal);

  return ContraloriaStatusResponseSchema.parse({
    activeSignals,
    contextSignals,
    hasActiveSanction: activeSignals.length > 0,
    personId,
  });
}
