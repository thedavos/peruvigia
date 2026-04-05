import { and, eq, inArray, type InferSelectModel } from "drizzle-orm";

import { normalizeName, slugify, stableStringify } from "@peruvigia/shared";

import { db } from "#api/db/index.ts";
import { entities, people, personEntityLinks, signals, sourceRecords } from "#api/db/schema.ts";
import { CONTRALORIA_SOURCE_TYPE } from "./types.ts";
import type {
  ContraloriaSyncResult,
  NormalizedSanctionRecord,
  PreparedSignal,
  SyncSummary,
} from "./types.ts";

type DatabaseClient = typeof db;
type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PersistenceClient = DatabaseClient | TransactionClient;
type PersonRecord = InferSelectModel<typeof people>;
type EntityRecord = InferSelectModel<typeof entities>;
type SourceRecord = InferSelectModel<typeof sourceRecords>;
const CONTRALORIA_BATCH_SIZE = 50;

type ContraloriaPersistenceCache = {
  entitiesByExternalIdentifier: Map<string, EntityRecord>;
  peopleByDocumentNumber: Map<string, PersonRecord>;
  peopleByNormalizedName: Map<string, PersonRecord[]>;
  sourceRecordsByExternalId: Map<string, SourceRecord>;
};

function emptySummary(): SyncSummary {
  return {
    downloaded: 0,
    failed: 0,
    inserted: 0,
    processed: 0,
    reused: 0,
    skipped: 0,
    updated: 0,
  };
}

function buildSignal(record: NormalizedSanctionRecord): PreparedSignal {
  const entityLabel = record.entityName ? ` en ${record.entityName}` : "";
  const resolutionLabel = record.resolutionNumber ? ` (${record.resolutionNumber})` : "";
  const titlePrefix = record.classification.isActive ? "Sancion vigente" : "Antecedente de sancion";

  return {
    isActive: record.classification.isActive,
    metadata: {
      attachmentUrl: record.attachmentUrl,
      canonicalKey: record.canonicalKey,
      classificationReason: record.classification.statusReason,
      endDate: record.endDate,
      entityName: record.entityName,
      fingerprintHash: record.fingerprintHash,
      rawStatus: record.statusRaw,
      reference: {
        rowNumber: record.rowNumber,
        sheetName: record.sheetName,
        sourceType: CONTRALORIA_SOURCE_TYPE,
      },
      regime: record.regime,
      reportDate: record.reportDate,
      reportUrl: record.reportUrl,
      resolutionDate: record.resolutionDate,
      resolutionNumber: record.resolutionNumber,
      sanctionType: record.sanctionType,
      scoreFactorKey: record.classification.isActive ? "active_contraloria_sanction" : null,
      sourceRecordExternalId: `contraloria:${record.fingerprintHash}`,
      startDate: record.startDate,
    },
    severity: record.classification.severity,
    signalType: record.classification.signalType,
    summary: `${record.sanctionType}${entityLabel}${resolutionLabel}`.trim(),
    title: `${titlePrefix}: ${record.fullName}`,
  };
}

function getSourceExternalId(record: Pick<NormalizedSanctionRecord, "fingerprintHash">) {
  return `contraloria:${record.fingerprintHash}`;
}

function getEntityExternalIdentifier(
  record: Pick<NormalizedSanctionRecord, "normalizedEntityName">,
) {
  return record.normalizedEntityName
    ? `contraloria-entity:${slugify(record.normalizedEntityName)}`
    : null;
}

function addPersonToCache(cache: ContraloriaPersistenceCache, person: PersonRecord) {
  if (person.documentNumber) {
    cache.peopleByDocumentNumber.set(person.documentNumber, person);
  }

  const peopleForName = cache.peopleByNormalizedName.get(person.normalizedName) ?? [];
  if (!peopleForName.some((candidate) => candidate.id === person.id)) {
    peopleForName.push(person);
    cache.peopleByNormalizedName.set(person.normalizedName, peopleForName);
  }
}

function addEntityToCache(cache: ContraloriaPersistenceCache, entity: EntityRecord) {
  if (entity.externalIdentifier) {
    cache.entitiesByExternalIdentifier.set(entity.externalIdentifier, entity);
  }
}

async function findOrCreatePerson(
  tx: PersistenceClient,
  record: NormalizedSanctionRecord,
  cache: ContraloriaPersistenceCache,
): Promise<PersonRecord> {
  if (record.normalizedDocumentNumber) {
    const personByDocument = cache.peopleByDocumentNumber.get(record.normalizedDocumentNumber);
    if (personByDocument) {
      return personByDocument;
    }
  }

  const peopleByName = cache.peopleByNormalizedName.get(record.normalizedFullName) ?? [];
  if (peopleByName.length === 1) {
    const [personByName] = peopleByName;

    if (personByName) {
      return personByName;
    }
  }

  const [createdPerson] = await tx
    .insert(people)
    .values({
      documentNumber: record.normalizedDocumentNumber ?? undefined,
      fullName: record.fullName ?? record.normalizedFullName,
      institutionName: record.entityName ?? undefined,
      normalizedName: record.normalizedFullName,
    })
    .returning();

  if (!createdPerson) {
    throw new Error("Failed to create person for Contraloria sanction record.");
  }

  addPersonToCache(cache, createdPerson);
  return createdPerson;
}

async function findOrCreateEntity(
  tx: PersistenceClient,
  record: NormalizedSanctionRecord,
  cache: ContraloriaPersistenceCache,
): Promise<EntityRecord | null> {
  if (!record.entityName || !record.normalizedEntityName) {
    return null;
  }

  const externalIdentifier = getEntityExternalIdentifier(record);
  if (!externalIdentifier) {
    return null;
  }

  const entityValues = {
    entityType: "public_institution" as const,
    externalIdentifier,
    metadata: {
      normalizedName: record.normalizedEntityName,
      source: CONTRALORIA_SOURCE_TYPE,
    },
    name: record.entityName,
    normalizedName: record.normalizedEntityName,
  };

  const existingEntity = cache.entitiesByExternalIdentifier.get(entityValues.externalIdentifier);

  const [entity] = existingEntity
    ? existingEntity.name === entityValues.name &&
      existingEntity.normalizedName === entityValues.normalizedName &&
      stableStringify(existingEntity.metadata) === stableStringify(entityValues.metadata)
      ? [existingEntity]
      : await tx
          .update(entities)
          .set(entityValues)
          .where(eq(entities.id, existingEntity.id))
          .returning()
    : await tx.insert(entities).values(entityValues).returning();

  if (!entity) {
    throw new Error("Failed to create or update entity for Contraloria sanction record.");
  }

  addEntityToCache(cache, entity);
  return entity;
}

function buildNormalizedPayload(record: NormalizedSanctionRecord, personId: string) {
  return {
    attachmentUrl: record.attachmentUrl,
    canonicalKey: record.canonicalKey,
    classification: record.classification,
    documentNumber: record.normalizedDocumentNumber,
    endDate: record.endDate,
    entityName: record.entityName,
    family: record.family,
    fingerprintHash: record.fingerprintHash,
    normalizedEntityName: record.normalizedEntityName,
    normalizedFullName: record.normalizedFullName,
    normalizedResolutionNumber: record.normalizedResolutionNumber,
    normalizedSanctionType: record.normalizedSanctionType,
    personId,
    rawStatus: record.statusRaw,
    regime: record.regime,
    reportDate: record.reportDate,
    reportUrl: record.reportUrl,
    resolutionDate: record.resolutionDate,
    resolutionNumber: record.resolutionNumber,
    sanctionType: record.sanctionType,
    sheetName: record.sheetName,
    sourceFileName: record.sourceFileName,
    startDate: record.startDate,
  } satisfies Record<string, unknown>;
}

function isSameSourceRecord(
  existingRecord: SourceRecord | undefined,
  nextRecord: {
    normalizedPayload: Record<string, unknown>;
    observedAt: Date;
    personId: string;
    rawPayload: Record<string, unknown>;
    sourceUrl: string;
  },
) {
  if (!existingRecord) {
    return false;
  }

  return (
    existingRecord.personId === nextRecord.personId &&
    existingRecord.sourceUrl === nextRecord.sourceUrl &&
    existingRecord.observedAt?.toISOString() === nextRecord.observedAt.toISOString() &&
    stableStringify(existingRecord.rawPayload) === stableStringify(nextRecord.rawPayload) &&
    stableStringify(existingRecord.normalizedPayload) ===
      stableStringify(nextRecord.normalizedPayload)
  );
}

async function loadExistingSourceRecords(
  databaseClient: DatabaseClient,
  records: NormalizedSanctionRecord[],
) {
  const sourceExternalIds = [...new Set(records.map((record) => getSourceExternalId(record)))];

  if (sourceExternalIds.length === 0) {
    return new Map<string, SourceRecord>();
  }

  const existingRecords = await databaseClient
    .select()
    .from(sourceRecords)
    .where(
      and(
        eq(sourceRecords.sourceType, CONTRALORIA_SOURCE_TYPE),
        inArray(sourceRecords.sourceExternalId, sourceExternalIds),
      ),
    );

  return new Map(
    existingRecords
      .filter(
        (record): record is SourceRecord & { sourceExternalId: string } =>
          !!record.sourceExternalId,
      )
      .map((record) => [record.sourceExternalId, record]),
  );
}

async function loadExistingPeople(
  databaseClient: DatabaseClient,
  records: NormalizedSanctionRecord[],
) {
  const documentNumbers = [
    ...new Set(
      records
        .map((record) => record.normalizedDocumentNumber)
        .filter((documentNumber): documentNumber is string => !!documentNumber),
    ),
  ];
  const normalizedNames = [...new Set(records.map((record) => record.normalizedFullName))];

  const [peopleByDocumentRows, peopleByNameRows] = await Promise.all([
    documentNumbers.length > 0
      ? databaseClient.select().from(people).where(inArray(people.documentNumber, documentNumbers))
      : Promise.resolve([] as PersonRecord[]),
    normalizedNames.length > 0
      ? databaseClient.select().from(people).where(inArray(people.normalizedName, normalizedNames))
      : Promise.resolve([] as PersonRecord[]),
  ]);

  const peopleByDocumentNumber = new Map<string, PersonRecord>();
  for (const person of peopleByDocumentRows) {
    if (person.documentNumber) {
      peopleByDocumentNumber.set(person.documentNumber, person);
    }
  }

  const peopleByNormalizedName = new Map<string, PersonRecord[]>();
  for (const person of peopleByNameRows) {
    const peopleForName = peopleByNormalizedName.get(person.normalizedName) ?? [];
    peopleForName.push(person);
    peopleByNormalizedName.set(person.normalizedName, peopleForName);
  }

  return {
    peopleByDocumentNumber,
    peopleByNormalizedName,
  };
}

async function loadExistingEntities(
  databaseClient: DatabaseClient,
  records: NormalizedSanctionRecord[],
) {
  const externalIdentifiers = [
    ...new Set(
      records
        .map((record) => getEntityExternalIdentifier(record))
        .filter((externalIdentifier): externalIdentifier is string => !!externalIdentifier),
    ),
  ];

  if (externalIdentifiers.length === 0) {
    return new Map<string, EntityRecord>();
  }

  const existingEntities = await databaseClient
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.entityType, "public_institution"),
        inArray(entities.externalIdentifier, externalIdentifiers),
      ),
    );

  return new Map(
    existingEntities
      .filter(
        (entity): entity is EntityRecord & { externalIdentifier: string } =>
          !!entity.externalIdentifier,
      )
      .map((entity) => [entity.externalIdentifier, entity]),
  );
}

async function createPersistenceCache(
  databaseClient: DatabaseClient,
  records: NormalizedSanctionRecord[],
): Promise<ContraloriaPersistenceCache> {
  const [sourceRecordsByExternalId, peopleCache, entitiesByExternalIdentifier] = await Promise.all([
    loadExistingSourceRecords(databaseClient, records),
    loadExistingPeople(databaseClient, records),
    loadExistingEntities(databaseClient, records),
  ]);

  return {
    entitiesByExternalIdentifier,
    peopleByDocumentNumber: peopleCache.peopleByDocumentNumber,
    peopleByNormalizedName: peopleCache.peopleByNormalizedName,
    sourceRecordsByExternalId,
  };
}

async function syncSingleRecord(
  tx: PersistenceClient,
  record: NormalizedSanctionRecord,
  cache: ContraloriaPersistenceCache,
  summary: SyncSummary,
) {
  const person = await findOrCreatePerson(tx, record, cache);
  const observedAt = new Date(`${record.reportDate}T00:00:00.000Z`);
  const normalizedPayload = buildNormalizedPayload(record, person.id);
  const existingSourceRecord = cache.sourceRecordsByExternalId.get(getSourceExternalId(record));

  if (
    isSameSourceRecord(existingSourceRecord, {
      normalizedPayload,
      observedAt,
      personId: person.id,
      rawPayload: record.rawPayload,
      sourceUrl: record.reportUrl,
    })
  ) {
    summary.reused += 1;
    return person;
  }

  const entity = await findOrCreateEntity(tx, record, cache);
  const sourceRecordValues = {
    normalizedPayload,
    observedAt,
    personId: person.id,
    rawPayload: record.rawPayload,
    sourceCategory: record.family,
    sourceExternalId: getSourceExternalId(record),
    sourceType: CONTRALORIA_SOURCE_TYPE,
    sourceUrl: record.reportUrl,
  };

  const [persistedSourceRecord] = existingSourceRecord
    ? await tx
        .update(sourceRecords)
        .set(sourceRecordValues)
        .where(eq(sourceRecords.id, existingSourceRecord.id))
        .returning()
    : await tx.insert(sourceRecords).values(sourceRecordValues).returning();

  if (!persistedSourceRecord) {
    throw new Error("Failed to persist source record for Contraloria sanction.");
  }

  cache.sourceRecordsByExternalId.set(sourceRecordValues.sourceExternalId, persistedSourceRecord);

  if (!existingSourceRecord) {
    summary.inserted += 1;
  } else {
    summary.updated += 1;
  }

  await tx.delete(signals).where(eq(signals.sourceRecordId, persistedSourceRecord.id));
  await tx
    .delete(personEntityLinks)
    .where(eq(personEntityLinks.sourceRecordId, persistedSourceRecord.id));

  if (entity) {
    await tx.insert(personEntityLinks).values({
      entityId: entity.id,
      linkType: "sanctioned_against_entity",
      metadata: {
        canonicalKey: record.canonicalKey,
        fingerprintHash: record.fingerprintHash,
        signalType: record.classification.signalType,
        source: CONTRALORIA_SOURCE_TYPE,
      },
      personId: person.id,
      sourceRecordId: persistedSourceRecord.id,
    });
  }

  const signal = buildSignal(record);
  await tx.insert(signals).values({
    isActive: signal.isActive,
    metadata: {
      ...signal.metadata,
      sourceRecordId: persistedSourceRecord.id,
    },
    personId: person.id,
    severity: signal.severity,
    signalType: signal.signalType,
    sourceRecordId: persistedSourceRecord.id,
    summary: signal.summary,
    title: signal.title,
  });

  return person;
}

function chunkRecords<T>(records: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }

  return chunks;
}

async function persistRecordBatch(
  databaseClient: DatabaseClient,
  batch: NormalizedSanctionRecord[],
  cache: ContraloriaPersistenceCache,
  summary: SyncSummary,
  errors: string[],
  affectedPersonIds: Set<string>,
) {
  await databaseClient.transaction(async (batchTx) => {
    for (const record of batch) {
      try {
        await batchTx.transaction(async (recordTx) => {
          const person = await syncSingleRecord(recordTx, record, cache, summary);
          affectedPersonIds.add(person.id);
        });
      } catch (error) {
        summary.failed += 1;
        errors.push(
          `${record.sourceFileName}:${record.sheetName}:${record.rowNumber} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  });
}

export async function persistContraloriaRecords(
  records: NormalizedSanctionRecord[],
  options?: {
    databaseClient?: DatabaseClient;
    initialSummary?: Partial<SyncSummary>;
  },
): Promise<ContraloriaSyncResult> {
  const databaseClient = options?.databaseClient ?? db;
  const summary = {
    ...emptySummary(),
    ...options?.initialSummary,
  };
  const affectedPersonIds = new Set<string>();
  const errors: string[] = [];
  const seenFingerprints = new Set<string>();
  const uniqueRecords: NormalizedSanctionRecord[] = [];

  for (const record of records) {
    summary.processed += 1;

    if (seenFingerprints.has(record.fingerprintHash)) {
      summary.skipped += 1;
      continue;
    }

    seenFingerprints.add(record.fingerprintHash);
    uniqueRecords.push(record);
  }

  const cache = await createPersistenceCache(databaseClient, uniqueRecords);
  const batches = chunkRecords(uniqueRecords, CONTRALORIA_BATCH_SIZE);

  for (const batch of batches) {
    await persistRecordBatch(databaseClient, batch, cache, summary, errors, affectedPersonIds);
  }

  return {
    affectedPersonIds: [...affectedPersonIds].sort((left, right) => left.localeCompare(right)),
    errors,
    summary,
  };
}

export function inferNormalizedNameFromSignalMetadata(metadata: Record<string, unknown>) {
  const entityName = typeof metadata.entityName === "string" ? metadata.entityName : null;
  return entityName ? normalizeName(entityName) : null;
}
