import { eq, max, type InferSelectModel } from "drizzle-orm";

import {
  ContraloriaStatusResponseSchema,
  formatIsoDate,
  readRecordString,
  type ContraloriaSignalType,
  type ContraloriaStatusResponse,
  type ContraloriaStatusSignal,
} from "@shared";

import { db } from "~/db/index.js";
import { people, signals, sourceRecords } from "~/db/schema.js";
import { CONTRALORIA_SOURCE_TYPE } from "./types.js";
import { persistContraloriaRecords } from "./repository.js";
import { acquireContraloriaAttachments } from "./source.js";
import { normalizeParsedRow, parseAttachmentRows } from "./workbook.js";
import type { AcquireOptions, ContraloriaSyncResult, NormalizedSanctionRecord } from "./types.js";

type DatabaseClient = typeof db;

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
): Promise<ContraloriaSyncResult> {
  const attachments = await acquireContraloriaAttachments(options);
  const normalizedRecords: NormalizedSanctionRecord[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const attachment of attachments) {
    const parsedRows = await parseAttachmentRows(attachment);

    for (const row of parsedRows) {
      const normalizedRow = normalizeParsedRow(row);
      if (!normalizedRow) {
        skipped += 1;
        continue;
      }

      normalizedRecords.push(normalizedRow);
    }
  }

  const incomingReportDate = getIncomingReportDate(normalizedRecords);
  const latestImportedReportDate = await getLatestImportedReportDate(databaseClient);

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

  const result = await persistContraloriaRecords(normalizedRecords, {
    databaseClient,
    initialSummary: {
      downloaded: attachments.length,
      skipped,
    },
  });

  errors.push(...result.errors);

  return {
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
