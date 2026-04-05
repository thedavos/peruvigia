import { and, eq, inArray, type InferSelectModel } from "drizzle-orm";

import { stableStringify } from "@peruvigia/shared";

import { db } from "#api/db";
import {
  entities,
  people,
  personEntityLinks,
  personPersonLinks,
  sourceRecords,
} from "#api/db/schema.ts";
import {
  DJI_SOURCE_TYPE,
  type DjiNormalizedDeclaration,
  type DjiSyncResult,
  type DjiSyncSummary,
} from "./types.ts";

type DatabaseClient = typeof db;
type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PersistenceClient = DatabaseClient | TransactionClient;
type PersonRecord = InferSelectModel<typeof people>;
type EntityRecord = InferSelectModel<typeof entities>;
type SourceRecord = InferSelectModel<typeof sourceRecords>;

type DjiPersistenceCache = {
  entitiesByExternalIdentifier: Map<string, EntityRecord>;
  peopleByDocumentNumber: Map<string, PersonRecord>;
  peopleByNormalizedName: Map<string, PersonRecord[]>;
  sourceRecordsByExternalId: Map<string, SourceRecord>;
};

const DJI_BATCH_SIZE = 25;

function emptySummary(): DjiSyncSummary {
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

function addPersonToCache(cache: DjiPersistenceCache, person: PersonRecord, includeName = true) {
  if (person.documentNumber) {
    cache.peopleByDocumentNumber.set(person.documentNumber, person);
  }

  if (!includeName) {
    return;
  }

  const peopleForName = cache.peopleByNormalizedName.get(person.normalizedName) ?? [];
  if (!peopleForName.some((candidate) => candidate.id === person.id)) {
    peopleForName.push(person);
    cache.peopleByNormalizedName.set(person.normalizedName, peopleForName);
  }
}

function addEntityToCache(cache: DjiPersistenceCache, entity: EntityRecord) {
  if (entity.externalIdentifier) {
    cache.entitiesByExternalIdentifier.set(entity.externalIdentifier, entity);
  }
}

async function findOrCreateDeclarant(
  tx: PersistenceClient,
  declaration: DjiNormalizedDeclaration,
  cache: DjiPersistenceCache,
) {
  if (declaration.documentNumber) {
    const personByDocument = cache.peopleByDocumentNumber.get(declaration.documentNumber);
    if (personByDocument) {
      if (
        personByDocument.fullName !== declaration.fullName ||
        personByDocument.currentPosition !== declaration.currentPosition ||
        personByDocument.institutionName !== declaration.institutionName
      ) {
        const [updatedPerson] = await tx
          .update(people)
          .set({
            currentPosition: declaration.currentPosition ?? undefined,
            fullName: declaration.fullName,
            institutionName: declaration.institutionName ?? undefined,
            normalizedName: declaration.normalizedName,
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

  const peopleByName = cache.peopleByNormalizedName.get(declaration.normalizedName) ?? [];
  if (peopleByName.length === 1) {
    const [personByName] = peopleByName;
    if (personByName) {
      return personByName;
    }
  }

  const [createdPerson] = await tx
    .insert(people)
    .values({
      currentPosition: declaration.currentPosition ?? undefined,
      documentNumber: declaration.documentNumber ?? undefined,
      fullName: declaration.fullName,
      institutionName: declaration.institutionName ?? undefined,
      normalizedName: declaration.normalizedName,
    })
    .returning();

  if (!createdPerson) {
    throw new Error("Failed to create declarant person for DJI declaration.");
  }

  addPersonToCache(cache, createdPerson);
  return createdPerson;
}

async function findOrCreateEntity(
  tx: PersistenceClient,
  cache: DjiPersistenceCache,
  link: DjiNormalizedDeclaration["entityLinks"][number],
) {
  const existingEntity = cache.entitiesByExternalIdentifier.get(link.externalIdentifier);
  const entityValues = {
    entityType: link.entityType,
    externalIdentifier: link.externalIdentifier,
    metadata: {
      detail: link.detail,
      source: DJI_SOURCE_TYPE,
    },
    name: link.entityName,
    normalizedName: link.normalizedEntityName,
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
    throw new Error("Failed to create or update DJI entity.");
  }

  addEntityToCache(cache, entity);
  return entity;
}

export function buildRelatedPersonReuseKey(link: DjiNormalizedDeclaration["personLinks"][number]) {
  return stableStringify({
    detail: link.detail,
    documentNumber: link.documentNumber,
    endDate: link.endDate,
    linkType: link.linkType,
    normalizedName: link.normalizedName,
    startDate: link.startDate,
  });
}

async function loadExistingRelatedPeopleBySourceRecordId(
  tx: PersistenceClient,
  sourceRecordId: string,
  personLinks: DjiNormalizedDeclaration["personLinks"],
) {
  const rows = await tx
    .select({
      link: personPersonLinks,
      relatedPerson: people,
    })
    .from(personPersonLinks)
    .innerJoin(people, eq(personPersonLinks.relatedPersonId, people.id))
    .where(eq(personPersonLinks.sourceRecordId, sourceRecordId));

  const linkKeys = new Set(personLinks.map((link) => buildRelatedPersonReuseKey(link)));

  return new Map(
    rows
      .map(({ link, relatedPerson }) => {
        const key = stableStringify({
          detail: typeof link.metadata.detail === "string" ? link.metadata.detail : null,
          documentNumber: relatedPerson.documentNumber,
          endDate: link.endDate,
          linkType: link.linkType,
          normalizedName: relatedPerson.normalizedName,
          startDate: link.startDate,
        });

        return linkKeys.has(key) ? [key, relatedPerson] : null;
      })
      .filter((entry): entry is [string, PersonRecord] => entry != null),
  );
}

async function findOrCreateRelatedPerson(
  tx: PersistenceClient,
  cache: DjiPersistenceCache,
  existingRelatedPeople: Map<string, PersonRecord>,
  link: DjiNormalizedDeclaration["personLinks"][number],
) {
  if (link.documentNumber) {
    const personByDocument = cache.peopleByDocumentNumber.get(link.documentNumber);
    if (personByDocument) {
      return personByDocument;
    }
  }

  const existingForSource = existingRelatedPeople.get(buildRelatedPersonReuseKey(link));
  if (existingForSource) {
    addPersonToCache(cache, existingForSource, false);
    return existingForSource;
  }

  const [createdPerson] = await tx
    .insert(people)
    .values({
      documentNumber: link.documentNumber ?? undefined,
      fullName: link.fullName,
      normalizedName: link.normalizedName,
    })
    .returning();

  if (!createdPerson) {
    throw new Error("Failed to create related person for DJI declaration.");
  }

  addPersonToCache(cache, createdPerson, false);
  return createdPerson;
}

function buildNormalizedPayload(declaration: DjiNormalizedDeclaration, personId: string) {
  return {
    currentPosition: declaration.currentPosition,
    declarationExternalId: declaration.declarationExternalId,
    documentNumber: declaration.documentNumber,
    entityLinkCount: declaration.entityLinks.length,
    entityLinks: declaration.entityLinks.map((link) => ({
      detail: link.detail,
      endDate: link.endDate,
      entityName: link.entityName,
      entityType: link.entityType,
      externalIdentifier: link.externalIdentifier,
      linkType: link.linkType,
      startDate: link.startDate,
    })),
    fullName: declaration.fullName,
    institutionName: declaration.institutionName,
    observedAt: declaration.observedAt,
    personId,
    personLinkCount: declaration.personLinks.length,
    personLinks: declaration.personLinks.map((link) => ({
      detail: link.detail,
      documentNumber: link.documentNumber,
      endDate: link.endDate,
      fullName: link.fullName,
      linkType: link.linkType,
      startDate: link.startDate,
    })),
  } satisfies Record<string, unknown>;
}

export function isSameDjiSourceRecord(
  existingRecord: SourceRecord | undefined,
  nextRecord: {
    normalizedPayload: Record<string, unknown>;
    observedAt: Date;
    personId: string;
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

async function loadExistingSourceRecords(
  databaseClient: DatabaseClient,
  declarations: DjiNormalizedDeclaration[],
) {
  const sourceExternalIds = [
    ...new Set(declarations.map((declaration) => declaration.declarationExternalId)),
  ];
  if (sourceExternalIds.length === 0) {
    return new Map<string, SourceRecord>();
  }

  const existingRecords = await databaseClient
    .select()
    .from(sourceRecords)
    .where(
      and(
        eq(sourceRecords.sourceType, DJI_SOURCE_TYPE),
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
  declarations: DjiNormalizedDeclaration[],
) {
  const documentNumbers = [
    ...new Set(
      declarations
        .flatMap((declaration) => [
          declaration.documentNumber,
          ...declaration.personLinks.map((link) => link.documentNumber),
        ])
        .filter((documentNumber): documentNumber is string => !!documentNumber),
    ),
  ];

  const normalizedNames = [
    ...new Set(declarations.map((declaration) => declaration.normalizedName)),
  ];

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
  declarations: DjiNormalizedDeclaration[],
) {
  const externalIdentifiers = [
    ...new Set(
      declarations.flatMap((declaration) =>
        declaration.entityLinks.map((link) => link.externalIdentifier),
      ),
    ),
  ];

  if (externalIdentifiers.length === 0) {
    return new Map<string, EntityRecord>();
  }

  const existingEntities = await databaseClient
    .select()
    .from(entities)
    .where(inArray(entities.externalIdentifier, externalIdentifiers));

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
  declarations: DjiNormalizedDeclaration[],
) {
  const [sourceRecordsByExternalId, peopleCache, entitiesByExternalIdentifier] = await Promise.all([
    loadExistingSourceRecords(databaseClient, declarations),
    loadExistingPeople(databaseClient, declarations),
    loadExistingEntities(databaseClient, declarations),
  ]);

  return {
    entitiesByExternalIdentifier,
    peopleByDocumentNumber: peopleCache.peopleByDocumentNumber,
    peopleByNormalizedName: peopleCache.peopleByNormalizedName,
    sourceRecordsByExternalId,
  } satisfies DjiPersistenceCache;
}

async function syncSingleDeclaration(
  tx: PersistenceClient,
  declaration: DjiNormalizedDeclaration,
  cache: DjiPersistenceCache,
  summary: DjiSyncSummary,
) {
  const declarant = await findOrCreateDeclarant(tx, declaration, cache);
  const observedAt = new Date(`${declaration.observedAt}T00:00:00.000Z`);
  const normalizedPayload = buildNormalizedPayload(declaration, declarant.id);
  const existingSourceRecord = cache.sourceRecordsByExternalId.get(
    declaration.declarationExternalId,
  );
  const rawPayload = {
    declaration: declaration.rawDeclaration,
    links: declaration.rawLinksByKind,
  } satisfies Record<string, unknown>;

  if (
    isSameDjiSourceRecord(existingSourceRecord, {
      normalizedPayload,
      observedAt,
      personId: declarant.id,
      rawPayload,
      sourceUrl: declaration.sourceUrl,
    })
  ) {
    summary.reused += 1;
    return declarant;
  }

  const sourceRecordValues = {
    normalizedPayload,
    observedAt,
    personId: declarant.id,
    rawPayload,
    sourceCategory: "declaration",
    sourceExternalId: declaration.declarationExternalId,
    sourceType: DJI_SOURCE_TYPE,
    sourceUrl: declaration.sourceUrl ?? undefined,
  };

  const [persistedSourceRecord] = existingSourceRecord
    ? await tx
        .update(sourceRecords)
        .set(sourceRecordValues)
        .where(eq(sourceRecords.id, existingSourceRecord.id))
        .returning()
    : await tx.insert(sourceRecords).values(sourceRecordValues).returning();

  if (!persistedSourceRecord) {
    throw new Error("Failed to persist DJI source record.");
  }

  cache.sourceRecordsByExternalId.set(declaration.declarationExternalId, persistedSourceRecord);

  if (!existingSourceRecord) {
    summary.inserted += 1;
  } else {
    summary.updated += 1;
  }

  const existingRelatedPeople = existingSourceRecord
    ? await loadExistingRelatedPeopleBySourceRecordId(
        tx,
        persistedSourceRecord.id,
        declaration.personLinks,
      )
    : new Map<string, PersonRecord>();

  await tx
    .delete(personEntityLinks)
    .where(eq(personEntityLinks.sourceRecordId, persistedSourceRecord.id));
  await tx
    .delete(personPersonLinks)
    .where(eq(personPersonLinks.sourceRecordId, persistedSourceRecord.id));

  for (const link of declaration.entityLinks) {
    const entity = await findOrCreateEntity(tx, cache, link);
    await tx.insert(personEntityLinks).values({
      endDate: link.endDate ?? undefined,
      entityId: entity.id,
      linkType: link.linkType,
      metadata: {
        ...link.metadata,
        detail: link.detail,
        externalIdentifier: link.externalIdentifier,
        source: DJI_SOURCE_TYPE,
      },
      personId: declarant.id,
      sourceRecordId: persistedSourceRecord.id,
      startDate: link.startDate ?? undefined,
    });
  }

  for (const link of declaration.personLinks) {
    const relatedPerson = await findOrCreateRelatedPerson(tx, cache, existingRelatedPeople, link);
    await tx.insert(personPersonLinks).values({
      endDate: link.endDate ?? undefined,
      linkType: link.linkType,
      metadata: {
        ...link.metadata,
        detail: link.detail,
        normalizedName: link.normalizedName,
        source: DJI_SOURCE_TYPE,
      },
      personId: declarant.id,
      relatedPersonId: relatedPerson.id,
      sourceRecordId: persistedSourceRecord.id,
      startDate: link.startDate ?? undefined,
    });
  }

  return declarant;
}

function chunkDeclarations<T>(declarations: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < declarations.length; index += size) {
    chunks.push(declarations.slice(index, index + size));
  }

  return chunks;
}

async function persistDeclarationBatch(
  databaseClient: DatabaseClient,
  batch: DjiNormalizedDeclaration[],
  cache: DjiPersistenceCache,
  summary: DjiSyncSummary,
  errors: string[],
  affectedPersonIds: Set<string>,
) {
  await databaseClient.transaction(async (batchTx) => {
    for (const declaration of batch) {
      try {
        await batchTx.transaction(async (declarationTx) => {
          const declarant = await syncSingleDeclaration(declarationTx, declaration, cache, summary);
          affectedPersonIds.add(declarant.id);
        });
      } catch (error) {
        summary.failed += 1;
        errors.push(
          `${declaration.declarationExternalId} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  });
}

export async function persistDjiDeclarations(
  declarations: DjiNormalizedDeclaration[],
  options?: {
    databaseClient?: DatabaseClient;
    initialSummary?: Partial<DjiSyncSummary>;
  },
): Promise<DjiSyncResult> {
  const databaseClient = options?.databaseClient ?? db;
  const summary = {
    ...emptySummary(),
    ...options?.initialSummary,
  };
  const affectedPersonIds = new Set<string>();
  const errors: string[] = [];
  const uniqueDeclarations: DjiNormalizedDeclaration[] = [];
  const seenExternalIds = new Set<string>();

  for (const declaration of declarations) {
    summary.processed += 1;

    if (seenExternalIds.has(declaration.declarationExternalId)) {
      summary.skipped += 1;
      continue;
    }

    seenExternalIds.add(declaration.declarationExternalId);
    uniqueDeclarations.push(declaration);
  }

  const cache = await createPersistenceCache(databaseClient, uniqueDeclarations);
  const batches = chunkDeclarations(uniqueDeclarations, DJI_BATCH_SIZE);

  for (const batch of batches) {
    await persistDeclarationBatch(databaseClient, batch, cache, summary, errors, affectedPersonIds);
  }

  return {
    affectedPersonIds: [...affectedPersonIds].sort((left, right) => left.localeCompare(right)),
    errors,
    summary,
  };
}
