import { eq, max } from "drizzle-orm";

import {
  DjiContextResponseSchema,
  formatIsoDate,
  readRecordString,
  type DjiContextResponse,
} from "@peruvigia/shared";

import { db } from "#api/db/index.js";
import {
  entities,
  people,
  personEntityLinks,
  personPersonLinks,
  sourceRecords,
} from "#api/db/schema.js";
import { normalizeDjiDatasets } from "./normalize.js";
import { persistDjiDeclarations } from "./repository.js";
import { acquireDjiDatasets } from "./source.js";
import { DJI_SOURCE_TYPE, type DjiAcquireOptions, type DjiSyncResult } from "./types.js";

type DatabaseClient = typeof db;

async function getLatestImportedObservedAt(databaseClient: DatabaseClient) {
  const [result] = await databaseClient
    .select({
      latestObservedAt: max(sourceRecords.observedAt),
    })
    .from(sourceRecords)
    .where(eq(sourceRecords.sourceType, DJI_SOURCE_TYPE));

  return result?.latestObservedAt ? formatIsoDate(result.latestObservedAt) : null;
}

function getIncomingObservedAt(declarations: Array<{ observedAt: string }>) {
  if (declarations.length === 0) {
    return null;
  }

  return declarations.reduce<string>(
    (latestDate, declaration) =>
      declaration.observedAt > latestDate ? declaration.observedAt : latestDate,
    declarations[0]!.observedAt,
  );
}

export async function runDjiSync(
  options: DjiAcquireOptions = {},
  databaseClient: DatabaseClient = db,
): Promise<DjiSyncResult> {
  const datasets = await acquireDjiDatasets(options);
  const normalized = normalizeDjiDatasets(datasets);

  const incomingObservedAt = getIncomingObservedAt(normalized.declarations);
  const latestImportedObservedAt = await getLatestImportedObservedAt(databaseClient);

  if (
    !options.allowBackfill &&
    incomingObservedAt &&
    latestImportedObservedAt &&
    incomingObservedAt < latestImportedObservedAt
  ) {
    throw new Error(
      `Refusing to import DJI declarations dated ${incomingObservedAt} because the latest imported declaration is ${latestImportedObservedAt}. Re-run with --allow-backfill if you intentionally want to import older data.`,
    );
  }

  const result = await persistDjiDeclarations(normalized.declarations, {
    databaseClient,
    initialSummary: {
      downloaded: datasets.length,
      skipped: normalized.skipped,
    },
  });

  return {
    errors: [...normalized.errors, ...result.errors],
    summary: result.summary,
  };
}

export async function getDjiContext(
  personId: string,
  databaseClient: DatabaseClient = db,
): Promise<DjiContextResponse | null> {
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

  const [entityRows, personRows] = await Promise.all([
    databaseClient
      .select({
        entity: entities,
        link: personEntityLinks,
        sourceRecord: sourceRecords,
      })
      .from(personEntityLinks)
      .innerJoin(entities, eq(personEntityLinks.entityId, entities.id))
      .innerJoin(sourceRecords, eq(personEntityLinks.sourceRecordId, sourceRecords.id))
      .where(eq(personEntityLinks.personId, personId)),
    databaseClient
      .select({
        link: personPersonLinks,
        relatedPerson: people,
        sourceRecord: sourceRecords,
      })
      .from(personPersonLinks)
      .innerJoin(people, eq(personPersonLinks.relatedPersonId, people.id))
      .innerJoin(sourceRecords, eq(personPersonLinks.sourceRecordId, sourceRecords.id))
      .where(eq(personPersonLinks.personId, personId)),
  ]);

  const entityLinks = entityRows
    .filter(({ sourceRecord }) => sourceRecord.sourceType === DJI_SOURCE_TYPE)
    .map(({ entity, link, sourceRecord }) => ({
      detail: readRecordString(link.metadata, "detail"),
      endDate: link.endDate,
      entity: {
        entityId: entity.id,
        entityType: entity.entityType,
        externalIdentifier: entity.externalIdentifier,
        name: entity.name,
      },
      evidence: {
        declarationExternalId: sourceRecord.sourceExternalId ?? sourceRecord.id,
        observedAt: sourceRecord.observedAt?.toISOString() ?? new Date().toISOString(),
        sourceRecordId: sourceRecord.id,
        sourceUrl: sourceRecord.sourceUrl,
      },
      linkId: link.id,
      linkType: link.linkType,
      startDate: link.startDate,
    }));

  const personLinks = personRows
    .filter(({ sourceRecord }) => sourceRecord.sourceType === DJI_SOURCE_TYPE)
    .map(({ link, relatedPerson, sourceRecord }) => ({
      detail: readRecordString(link.metadata, "detail"),
      endDate: link.endDate,
      evidence: {
        declarationExternalId: sourceRecord.sourceExternalId ?? sourceRecord.id,
        observedAt: sourceRecord.observedAt?.toISOString() ?? new Date().toISOString(),
        sourceRecordId: sourceRecord.id,
        sourceUrl: sourceRecord.sourceUrl,
      },
      linkId: link.id,
      linkType: link.linkType,
      relatedPerson: {
        documentNumber: relatedPerson.documentNumber,
        fullName: relatedPerson.fullName,
        personId: relatedPerson.id,
      },
      startDate: link.startDate,
    }));

  const compareLinks = <
    T extends { evidence: { observedAt: string }; linkType: string; detail: string | null },
  >(
    left: T,
    right: T,
  ) =>
    right.evidence.observedAt.localeCompare(left.evidence.observedAt) ||
    left.linkType.localeCompare(right.linkType) ||
    (left.detail ?? "").localeCompare(right.detail ?? "");

  return DjiContextResponseSchema.parse({
    entityLinks: entityLinks.sort(compareLinks),
    personId,
    personLinks: personLinks.sort(compareLinks),
  });
}
