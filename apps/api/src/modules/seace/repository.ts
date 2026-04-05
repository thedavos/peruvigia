import { and, eq, inArray, or, type InferSelectModel } from "drizzle-orm";

import { stableStringify } from "@peruvigia/shared";

import { db } from "#api/db/index.ts";
import { entities, people, personEntityLinks, sourceRecords } from "#api/db/schema.ts";
import {
  SEACE_SOURCE_TYPE,
  type SeaceNormalizedAward,
  type SeaceNormalizedContractingEntity,
  type SeaceNormalizedRnpLink,
  type SeaceNormalizationResult,
  type SeaceSyncResult,
  type SeaceSyncSummary,
} from "./types.ts";

type DatabaseClient = typeof db;
type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PersistenceClient = DatabaseClient | TransactionClient;
type PersonRecord = InferSelectModel<typeof people>;
type EntityRecord = InferSelectModel<typeof entities>;
type SourceRecord = InferSelectModel<typeof sourceRecords>;

type SeacePersistenceInput = Pick<
  SeaceNormalizationResult,
  "awards" | "contractingEntities" | "rnpLinks"
>;

type SeacePersistenceCache = {
  entitiesByExternalIdentifier: Map<string, EntityRecord>;
  peopleByDocumentNumber: Map<string, PersonRecord>;
  peopleByNormalizedName: Map<string, PersonRecord[]>;
  sourceRecordsByExternalId: Map<string, SourceRecord>;
};

const SEACE_BATCH_SIZE = 50;
const SEACE_LOOKUP_BATCH_SIZE = 500;

function emptySummary(): SeaceSyncSummary {
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

function addPersonToCache(cache: SeacePersistenceCache, person: PersonRecord) {
  if (person.documentNumber) {
    cache.peopleByDocumentNumber.set(person.documentNumber, person);
  }

  const peopleForName = cache.peopleByNormalizedName.get(person.normalizedName) ?? [];
  if (!peopleForName.some((candidate) => candidate.id === person.id)) {
    peopleForName.push(person);
    cache.peopleByNormalizedName.set(person.normalizedName, peopleForName);
  }
}

function addEntityToCache(cache: SeacePersistenceCache, entity: EntityRecord) {
  if (entity.externalIdentifier) {
    cache.entitiesByExternalIdentifier.set(entity.externalIdentifier, entity);
  }
}

function inferProviderEntityType() {
  return "supplier" as const;
}

function inferContractingEntityType() {
  return "public_institution" as const;
}

async function findOrCreatePerson(
  tx: PersistenceClient,
  link: SeaceNormalizedRnpLink,
  cache: SeacePersistenceCache,
) {
  if (link.personDocumentNumber) {
    const personByDocument = cache.peopleByDocumentNumber.get(link.personDocumentNumber);
    if (personByDocument) {
      if (personByDocument.fullName !== link.personFullName) {
        const [updatedPerson] = await tx
          .update(people)
          .set({
            fullName: link.personFullName,
            normalizedName: link.normalizedPersonName,
          })
          .where(eq(people.id, personByDocument.id))
          .returning();

        if (updatedPerson) {
          addPersonToCache(cache, updatedPerson);
          return updatedPerson;
        }
      }

      return personByDocument;
    }
  }

  const peopleByName = cache.peopleByNormalizedName.get(link.normalizedPersonName) ?? [];
  if (peopleByName.length === 1) {
    const [personByName] = peopleByName;
    if (personByName) {
      return personByName;
    }
  }

  const [createdPerson] = await tx
    .insert(people)
    .values({
      documentNumber: link.personDocumentNumber ?? undefined,
      fullName: link.personFullName,
      normalizedName: link.normalizedPersonName,
    })
    .returning();

  if (!createdPerson) {
    throw new Error("Failed to create person for SEACE RNP link.");
  }

  addPersonToCache(cache, createdPerson);
  return createdPerson;
}

async function findOrCreateProviderEntity(
  tx: PersistenceClient,
  provider: {
    normalizedProviderName: string;
    providerExternalId: string;
    providerName: string;
  },
  cache: SeacePersistenceCache,
) {
  const entityType = inferProviderEntityType();
  const existingEntity = cache.entitiesByExternalIdentifier.get(provider.providerExternalId);
  const entityValues = {
    entityType,
    externalIdentifier: provider.providerExternalId,
    metadata: {
      source: SEACE_SOURCE_TYPE,
    },
    name: provider.providerName,
    normalizedName: provider.normalizedProviderName,
  };

  const [entity] = existingEntity
    ? existingEntity.name === entityValues.name &&
      existingEntity.normalizedName === entityValues.normalizedName &&
      existingEntity.entityType === entityValues.entityType &&
      stableStringify(existingEntity.metadata) === stableStringify(entityValues.metadata)
      ? [existingEntity]
      : await tx
          .update(entities)
          .set(entityValues)
          .where(eq(entities.id, existingEntity.id))
          .returning()
    : await tx.insert(entities).values(entityValues).returning();

  if (!entity) {
    throw new Error("Failed to create or update SEACE supplier entity.");
  }

  addEntityToCache(cache, entity);
  return entity;
}

async function findOrCreateContractingEntity(
  tx: PersistenceClient,
  entityInput:
    | Pick<
        SeaceNormalizedAward,
        "contractingEntityExternalId" | "contractingEntityName" | "normalizedContractingEntityName"
      >
    | Pick<
        SeaceNormalizedContractingEntity,
        | "entityExternalId"
        | "entityName"
        | "normalizedEntityName"
        | "acronym"
        | "governmentLevel"
        | "sector"
        | "status"
      >,
  cache: SeacePersistenceCache,
) {
  const isCanonical = "entityExternalId" in entityInput;
  const externalIdentifier = isCanonical
    ? entityInput.entityExternalId
    : entityInput.contractingEntityExternalId;
  const name = isCanonical ? entityInput.entityName : entityInput.contractingEntityName;
  const normalizedName = isCanonical
    ? entityInput.normalizedEntityName
    : entityInput.normalizedContractingEntityName;
  const existingEntity = cache.entitiesByExternalIdentifier.get(externalIdentifier);
  const entityValues = {
    entityType: inferContractingEntityType(),
    externalIdentifier,
    metadata: {
      acronym: isCanonical ? entityInput.acronym : null,
      governmentLevel: isCanonical ? entityInput.governmentLevel : null,
      sector: isCanonical ? entityInput.sector : null,
      source: SEACE_SOURCE_TYPE,
      status: isCanonical ? entityInput.status : null,
    },
    name,
    normalizedName,
  };

  const [entity] = existingEntity
    ? existingEntity.name === entityValues.name &&
      existingEntity.normalizedName === entityValues.normalizedName &&
      existingEntity.entityType === entityValues.entityType &&
      stableStringify(existingEntity.metadata) === stableStringify(entityValues.metadata)
      ? [existingEntity]
      : await tx
          .update(entities)
          .set(entityValues)
          .where(eq(entities.id, existingEntity.id))
          .returning()
    : await tx.insert(entities).values(entityValues).returning();

  if (!entity) {
    throw new Error("Failed to create or update SEACE contracting entity.");
  }

  addEntityToCache(cache, entity);
  return entity;
}

function buildNormalizedPayloadForRnp(link: SeaceNormalizedRnpLink, personId: string) {
  return {
    normalizedPersonName: link.normalizedPersonName,
    normalizedProviderName: link.normalizedProviderName,
    observedAt: link.observedAt,
    personDocumentNumber: link.personDocumentNumber,
    personDocumentType: link.personDocumentType,
    personFullName: link.personFullName,
    personId,
    providerDocumentNumber: link.providerDocumentNumber,
    providerExternalId: link.providerExternalId,
    providerName: link.providerName,
    relationshipType: link.relationshipType,
    sourceExternalId: link.sourceExternalId,
  } satisfies Record<string, unknown>;
}

function buildNormalizedPayloadForAward(record: SeaceNormalizedAward) {
  return {
    awardedAt: record.awardedAt,
    contractingEntityExternalId: record.contractingEntityExternalId,
    contractingEntityName: record.contractingEntityName,
    currency: record.currency,
    normalizedContractingEntityName: record.normalizedContractingEntityName,
    normalizedSupplierName: record.normalizedSupplierName,
    objectDescription: record.objectDescription,
    processExternalId: record.processExternalId,
    processType: record.processType,
    sourceExternalId: record.sourceExternalId,
    status: record.status,
    supplierDocumentNumber: record.supplierDocumentNumber,
    supplierExternalId: record.supplierExternalId,
    supplierName: record.supplierName,
    totalAmount: record.totalAmount,
  } satisfies Record<string, unknown>;
}

function buildNormalizedPayloadForContractingEntity(record: SeaceNormalizedContractingEntity) {
  return {
    acronym: record.acronym,
    entityExternalId: record.entityExternalId,
    entityName: record.entityName,
    governmentLevel: record.governmentLevel,
    normalizedEntityName: record.normalizedEntityName,
    sector: record.sector,
    sourceExternalId: record.sourceExternalId,
    status: record.status,
  } satisfies Record<string, unknown>;
}

export function isSameSeaceSourceRecord(
  existingRecord: SourceRecord | undefined,
  nextRecord: {
    normalizedPayload: Record<string, unknown>;
    observedAt: Date;
    personId: string | null;
    rawPayload: Record<string, unknown>;
    sourceUrl: string | null;
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

function getAllSourceExternalIds(records: SeacePersistenceInput) {
  return [
    ...new Set([
      ...records.rnpLinks.map((record) => record.sourceExternalId),
      ...records.awards.map((record) => record.sourceExternalId),
      ...records.contractingEntities.map((record) => record.sourceExternalId),
    ]),
  ];
}

function chunkRecords<T>(records: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }

  return chunks;
}

async function loadExistingSourceRecords(
  databaseClient: DatabaseClient,
  records: SeacePersistenceInput,
) {
  const sourceExternalIds = getAllSourceExternalIds(records);
  if (sourceExternalIds.length === 0) {
    return new Map<string, SourceRecord>();
  }

  const existingRecords = (
    await Promise.all(
      chunkRecords(sourceExternalIds, SEACE_LOOKUP_BATCH_SIZE).map((batch) =>
        databaseClient
          .select()
          .from(sourceRecords)
          .where(
            and(
              eq(sourceRecords.sourceType, SEACE_SOURCE_TYPE),
              inArray(sourceRecords.sourceExternalId, batch),
            ),
          ),
      ),
    )
  ).flat();

  return new Map(
    existingRecords
      .filter(
        (record): record is SourceRecord & { sourceExternalId: string } =>
          !!record.sourceExternalId,
      )
      .map((record) => [record.sourceExternalId, record]),
  );
}

async function loadExistingPeople(databaseClient: DatabaseClient, records: SeacePersistenceInput) {
  const documentNumbers = [
    ...new Set(
      records.rnpLinks
        .map((record) => record.personDocumentNumber)
        .filter((documentNumber): documentNumber is string => !!documentNumber),
    ),
  ];
  const normalizedNames = [
    ...new Set(records.rnpLinks.map((record) => record.normalizedPersonName)),
  ];

  const [peopleByDocumentRows, peopleByNameRows] = await Promise.all([
    documentNumbers.length > 0
      ? (
          await Promise.all(
            chunkRecords(documentNumbers, SEACE_LOOKUP_BATCH_SIZE).map((batch) =>
              databaseClient.select().from(people).where(inArray(people.documentNumber, batch)),
            ),
          )
        ).flat()
      : Promise.resolve([] as PersonRecord[]),
    normalizedNames.length > 0
      ? (
          await Promise.all(
            chunkRecords(normalizedNames, SEACE_LOOKUP_BATCH_SIZE).map((batch) =>
              databaseClient.select().from(people).where(inArray(people.normalizedName, batch)),
            ),
          )
        ).flat()
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
  records: SeacePersistenceInput,
) {
  const externalIdentifiers = [
    ...new Set([
      ...records.rnpLinks.map((record) => record.providerExternalId),
      ...records.awards.flatMap((record) => [
        record.supplierExternalId,
        record.contractingEntityExternalId,
      ]),
      ...records.contractingEntities.map((record) => record.entityExternalId),
    ]),
  ];

  if (externalIdentifiers.length === 0) {
    return new Map<string, EntityRecord>();
  }

  const existingEntities = (
    await Promise.all(
      chunkRecords(externalIdentifiers, SEACE_LOOKUP_BATCH_SIZE).map((batch) =>
        databaseClient.select().from(entities).where(inArray(entities.externalIdentifier, batch)),
      ),
    )
  ).flat();

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
  records: SeacePersistenceInput,
): Promise<SeacePersistenceCache> {
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

async function persistRnpLink(
  tx: PersistenceClient,
  link: SeaceNormalizedRnpLink,
  cache: SeacePersistenceCache,
  summary: SeaceSyncSummary,
) {
  const person = await findOrCreatePerson(tx, link, cache);
  const entity = await findOrCreateProviderEntity(tx, link, cache);
  const observedAt = new Date(`${link.observedAt}T00:00:00.000Z`);
  const normalizedPayload = buildNormalizedPayloadForRnp(link, person.id);
  const existingSourceRecord = cache.sourceRecordsByExternalId.get(link.sourceExternalId);

  if (
    isSameSeaceSourceRecord(existingSourceRecord, {
      normalizedPayload,
      observedAt,
      personId: person.id,
      rawPayload: link.rawPayload,
      sourceUrl: link.sourceUrl,
    })
  ) {
    summary.reused += 1;
    return;
  }

  const sourceRecordValues = {
    normalizedPayload,
    observedAt,
    personId: person.id,
    rawPayload: link.rawPayload,
    sourceCategory: "rnp_people",
    sourceExternalId: link.sourceExternalId,
    sourceType: SEACE_SOURCE_TYPE,
    sourceUrl: link.sourceUrl ?? undefined,
  };

  const [persistedSourceRecord] = existingSourceRecord
    ? await tx
        .update(sourceRecords)
        .set(sourceRecordValues)
        .where(eq(sourceRecords.id, existingSourceRecord.id))
        .returning()
    : await tx.insert(sourceRecords).values(sourceRecordValues).returning();

  if (!persistedSourceRecord) {
    throw new Error("Failed to persist SEACE RNP source record.");
  }

  cache.sourceRecordsByExternalId.set(link.sourceExternalId, persistedSourceRecord);

  if (!existingSourceRecord) {
    summary.inserted += 1;
  } else {
    summary.updated += 1;
  }

  await tx
    .delete(personEntityLinks)
    .where(eq(personEntityLinks.sourceRecordId, persistedSourceRecord.id));

  await tx.insert(personEntityLinks).values({
    entityId: entity.id,
    linkType: "supplier_relationship",
    metadata: {
      declaredRole: link.relationshipType,
      personDocumentType: link.personDocumentType,
      providerDocumentNumber: link.providerDocumentNumber,
      source: SEACE_SOURCE_TYPE,
    },
    personId: person.id,
    sourceRecordId: persistedSourceRecord.id,
  });

  return [person.id];
}

async function findAffectedPeopleByEntityExternalIdentifiers(
  tx: PersistenceClient,
  externalIdentifiers: string[],
) {
  if (externalIdentifiers.length === 0) {
    return [];
  }

  const rows = await tx
    .select({
      personId: personEntityLinks.personId,
    })
    .from(personEntityLinks)
    .innerJoin(entities, eq(personEntityLinks.entityId, entities.id))
    .where(
      and(
        inArray(entities.externalIdentifier, externalIdentifiers),
        or(
          eq(personEntityLinks.linkType, "supplier_relationship"),
          eq(personEntityLinks.linkType, "commercial"),
          eq(personEntityLinks.linkType, "board_membership"),
          eq(personEntityLinks.linkType, "employment"),
          eq(personEntityLinks.linkType, "guild"),
        ),
      ),
    );

  return [...new Set(rows.map((row) => row.personId))];
}

async function persistAward(
  tx: PersistenceClient,
  record: SeaceNormalizedAward,
  cache: SeacePersistenceCache,
  summary: SeaceSyncSummary,
) {
  await findOrCreateProviderEntity(
    tx,
    {
      normalizedProviderName: record.normalizedSupplierName,
      providerExternalId: record.supplierExternalId,
      providerName: record.supplierName,
    },
    cache,
  );
  await findOrCreateContractingEntity(
    tx,
    {
      contractingEntityExternalId: record.contractingEntityExternalId,
      contractingEntityName: record.contractingEntityName,
      normalizedContractingEntityName: record.normalizedContractingEntityName,
    },
    cache,
  );

  const observedAt = new Date(`${record.awardedAt ?? "1970-01-01"}T00:00:00.000Z`);
  const normalizedPayload = buildNormalizedPayloadForAward(record);
  const existingSourceRecord = cache.sourceRecordsByExternalId.get(record.sourceExternalId);

  if (
    isSameSeaceSourceRecord(existingSourceRecord, {
      normalizedPayload,
      observedAt,
      personId: null,
      rawPayload: record.rawPayload,
      sourceUrl: record.sourceUrl,
    })
  ) {
    summary.reused += 1;
    return;
  }

  const sourceRecordValues = {
    normalizedPayload,
    observedAt,
    personId: null,
    rawPayload: record.rawPayload,
    sourceCategory: "awards",
    sourceExternalId: record.sourceExternalId,
    sourceType: SEACE_SOURCE_TYPE,
    sourceUrl: record.sourceUrl ?? undefined,
  };

  const [persistedSourceRecord] = existingSourceRecord
    ? await tx
        .update(sourceRecords)
        .set(sourceRecordValues)
        .where(eq(sourceRecords.id, existingSourceRecord.id))
        .returning()
    : await tx.insert(sourceRecords).values(sourceRecordValues).returning();

  if (!persistedSourceRecord) {
    throw new Error("Failed to persist SEACE award source record.");
  }

  cache.sourceRecordsByExternalId.set(record.sourceExternalId, persistedSourceRecord);

  if (!existingSourceRecord) {
    summary.inserted += 1;
  } else {
    summary.updated += 1;
  }

  return await findAffectedPeopleByEntityExternalIdentifiers(tx, [
    record.supplierExternalId,
    record.contractingEntityExternalId,
  ]);
}

async function persistContractingEntityRecord(
  tx: PersistenceClient,
  record: SeaceNormalizedContractingEntity,
  cache: SeacePersistenceCache,
  summary: SeaceSyncSummary,
) {
  await findOrCreateContractingEntity(tx, record, cache);
  const observedAt = new Date("1970-01-01T00:00:00.000Z");
  const normalizedPayload = buildNormalizedPayloadForContractingEntity(record);
  const existingSourceRecord = cache.sourceRecordsByExternalId.get(record.sourceExternalId);

  if (
    isSameSeaceSourceRecord(existingSourceRecord, {
      normalizedPayload,
      observedAt,
      personId: null,
      rawPayload: record.rawPayload,
      sourceUrl: record.sourceUrl,
    })
  ) {
    summary.reused += 1;
    return;
  }

  const sourceRecordValues = {
    normalizedPayload,
    observedAt,
    personId: null,
    rawPayload: record.rawPayload,
    sourceCategory: "contracting_entities",
    sourceExternalId: record.sourceExternalId,
    sourceType: SEACE_SOURCE_TYPE,
    sourceUrl: record.sourceUrl ?? undefined,
  };

  const [persistedSourceRecord] = existingSourceRecord
    ? await tx
        .update(sourceRecords)
        .set(sourceRecordValues)
        .where(eq(sourceRecords.id, existingSourceRecord.id))
        .returning()
    : await tx.insert(sourceRecords).values(sourceRecordValues).returning();

  if (!persistedSourceRecord) {
    throw new Error("Failed to persist SEACE contracting entity source record.");
  }

  cache.sourceRecordsByExternalId.set(record.sourceExternalId, persistedSourceRecord);

  if (!existingSourceRecord) {
    summary.inserted += 1;
  } else {
    summary.updated += 1;
  }

  return await findAffectedPeopleByEntityExternalIdentifiers(tx, [record.entityExternalId]);
}

async function persistRecordBatch<T>(
  databaseClient: DatabaseClient,
  batch: T[],
  persistRecord: (
    tx: PersistenceClient,
    record: T,
    cache: SeacePersistenceCache,
    summary: SeaceSyncSummary,
  ) => Promise<string[] | void>,
  cache: SeacePersistenceCache,
  summary: SeaceSyncSummary,
  errors: string[],
  describeRecord: (record: T) => string,
  affectedPersonIds: Set<string>,
) {
  await databaseClient.transaction(async (batchTx) => {
    for (const record of batch) {
      try {
        await batchTx.transaction(async (recordTx) => {
          const nextAffectedPersonIds = await persistRecord(recordTx, record, cache, summary);
          for (const personId of nextAffectedPersonIds ?? []) {
            affectedPersonIds.add(personId);
          }
        });
      } catch (error) {
        summary.failed += 1;
        errors.push(
          `${describeRecord(record)} ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  });
}

export async function persistSeaceRecords(
  records: SeacePersistenceInput,
  options?: {
    databaseClient?: DatabaseClient;
    initialSummary?: Partial<SeaceSyncSummary>;
  },
): Promise<SeaceSyncResult> {
  const databaseClient = options?.databaseClient ?? db;
  const summary = {
    ...emptySummary(),
    ...options?.initialSummary,
  };
  const affectedPersonIds = new Set<string>();
  const errors: string[] = [];

  const uniqueRecords = {
    awards: records.awards.filter(
      (record, index, list) =>
        list.findIndex((candidate) => candidate.sourceExternalId === record.sourceExternalId) ===
        index,
    ),
    contractingEntities: records.contractingEntities.filter(
      (record, index, list) =>
        list.findIndex((candidate) => candidate.sourceExternalId === record.sourceExternalId) ===
        index,
    ),
    rnpLinks: records.rnpLinks.filter(
      (record, index, list) =>
        list.findIndex((candidate) => candidate.sourceExternalId === record.sourceExternalId) ===
        index,
    ),
  } satisfies SeacePersistenceInput;

  summary.processed +=
    records.rnpLinks.length + records.awards.length + records.contractingEntities.length;
  summary.skipped +=
    records.rnpLinks.length -
    uniqueRecords.rnpLinks.length +
    (records.awards.length - uniqueRecords.awards.length) +
    (records.contractingEntities.length - uniqueRecords.contractingEntities.length);

  const cache = await createPersistenceCache(databaseClient, uniqueRecords);

  for (const batch of chunkRecords(uniqueRecords.rnpLinks, SEACE_BATCH_SIZE)) {
    await persistRecordBatch(
      databaseClient,
      batch,
      persistRnpLink,
      cache,
      summary,
      errors,
      (record) => record.sourceExternalId,
      affectedPersonIds,
    );
  }

  for (const batch of chunkRecords(uniqueRecords.awards, SEACE_BATCH_SIZE)) {
    await persistRecordBatch(
      databaseClient,
      batch,
      persistAward,
      cache,
      summary,
      errors,
      (record) => record.sourceExternalId,
      affectedPersonIds,
    );
  }

  for (const batch of chunkRecords(uniqueRecords.contractingEntities, SEACE_BATCH_SIZE)) {
    await persistRecordBatch(
      databaseClient,
      batch,
      persistContractingEntityRecord,
      cache,
      summary,
      errors,
      (record) => record.sourceExternalId,
      affectedPersonIds,
    );
  }

  return {
    affectedPersonIds: [...affectedPersonIds].sort((left, right) => left.localeCompare(right)),
    errors,
    summary,
  };
}
