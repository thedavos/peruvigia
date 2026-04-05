import { desc, eq } from "drizzle-orm";

import { normalizeName, readRecordString, stableStringify } from "@peruvigia/shared";

import { db } from "#api/db/index.ts";
import {
  entities,
  people,
  personEntityLinks,
  scoreSnapshots,
  searchAliases,
  sourceRecords,
} from "#api/db/schema.ts";
import type { SourceAliasCandidate, SupplierRelationshipRecord } from "./types.ts";

type DatabaseClient = typeof db;

export async function getPersonRecord(personId: string, databaseClient: DatabaseClient = db) {
  const [person] = await databaseClient
    .select({
      documentNumber: people.documentNumber,
      fullName: people.fullName,
      id: people.id,
      normalizedName: people.normalizedName,
    })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);

  return person ?? null;
}

export async function listSupplierRelationships(
  personId: string,
  databaseClient: DatabaseClient = db,
): Promise<SupplierRelationshipRecord[]> {
  const rows = await databaseClient
    .select({
      entity: entities,
      link: personEntityLinks,
      sourceRecord: sourceRecords,
    })
    .from(personEntityLinks)
    .innerJoin(entities, eq(personEntityLinks.entityId, entities.id))
    .innerJoin(sourceRecords, eq(personEntityLinks.sourceRecordId, sourceRecords.id))
    .where(eq(personEntityLinks.personId, personId));

  return rows
    .filter(
      ({ link, sourceRecord }) =>
        link.linkType === "supplier_relationship" && sourceRecord.sourceType === "osce_seace",
    )
    .map(({ entity, link, sourceRecord }) => ({
      declaredRole: readRecordString(link.metadata, "declaredRole"),
      detail: readRecordString(link.metadata, "detail"),
      entity: {
        entityId: entity.id,
        entityType: entity.entityType,
        externalIdentifier: entity.externalIdentifier,
        name: entity.name,
      },
      evidence: {
        observedAt: sourceRecord.observedAt?.toISOString() ?? null,
        sourceExternalId: sourceRecord.sourceExternalId,
        sourceRecordId: sourceRecord.id,
        sourceUrl: sourceRecord.sourceUrl,
      },
      linkId: link.id,
    }));
}

function normalizeAlias(value: string | null) {
  return value ? normalizeName(value) : null;
}

export async function listSourceAliasCandidates(
  personId: string,
  databaseClient: DatabaseClient = db,
): Promise<SourceAliasCandidate[]> {
  const rows = await databaseClient
    .select({
      normalizedPayload: sourceRecords.normalizedPayload,
      rawPayload: sourceRecords.rawPayload,
      sourceRecordId: sourceRecords.id,
    })
    .from(sourceRecords)
    .where(eq(sourceRecords.personId, personId))
    .orderBy(desc(sourceRecords.observedAt), desc(sourceRecords.importedAt));

  const aliases: SourceAliasCandidate[] = [];

  for (const row of rows) {
    const rawPayload = row.rawPayload;
    const normalizedPayload = row.normalizedPayload ?? {};
    const candidates = [
      readRecordString(rawPayload, "fullName"),
      readRecordString(rawPayload, "personFullName"),
      readRecordString(normalizedPayload, "fullName"),
      readRecordString(normalizedPayload, "personFullName"),
      readRecordString(normalizedPayload, "normalizedFullName"),
      readRecordString(normalizedPayload, "normalizedPersonName"),
    ];

    for (const candidate of candidates) {
      const alias = candidate?.trim();
      const normalizedAlias = normalizeAlias(alias ?? null);
      if (!alias || !normalizedAlias) {
        continue;
      }

      aliases.push({
        alias,
        confidence: alias === normalizedAlias ? 0.7 : 0.9,
        normalizedAlias,
        sourceRecordId: row.sourceRecordId,
      });
    }
  }

  return aliases;
}

export async function upsertSearchAliasesForPerson(
  personId: string,
  aliases: SourceAliasCandidate[],
  databaseClient: DatabaseClient = db,
) {
  const existingAliases = await databaseClient
    .select({
      normalizedAlias: searchAliases.normalizedAlias,
    })
    .from(searchAliases)
    .where(eq(searchAliases.personId, personId));

  const existingNormalizedAliases = new Set(existingAliases.map((alias) => alias.normalizedAlias));
  const nextAliases = aliases.filter(
    (alias) => !existingNormalizedAliases.has(alias.normalizedAlias),
  );

  if (nextAliases.length === 0) {
    return;
  }

  await databaseClient.insert(searchAliases).values(
    nextAliases.map((alias) => ({
      alias: alias.alias,
      confidence: alias.confidence,
      normalizedAlias: alias.normalizedAlias,
      personId,
      sourceRecordId: alias.sourceRecordId ?? undefined,
    })),
  );
}

export async function getLatestScoreSnapshot(
  personId: string,
  databaseClient: DatabaseClient = db,
) {
  const [snapshot] = await databaseClient
    .select()
    .from(scoreSnapshots)
    .where(eq(scoreSnapshots.personId, personId))
    .orderBy(desc(scoreSnapshots.calculatedAt))
    .limit(1);

  return snapshot ?? null;
}

export async function persistScoreSnapshot(
  input: {
    calculationVersion: string;
    factors: Record<string, unknown>;
    personId: string;
    scoreLevel: string;
    scoreValue: number;
  },
  databaseClient: DatabaseClient = db,
) {
  const latestSnapshot = await getLatestScoreSnapshot(input.personId, databaseClient);
  if (
    latestSnapshot &&
    latestSnapshot.calculationVersion === input.calculationVersion &&
    latestSnapshot.scoreLevel === input.scoreLevel &&
    latestSnapshot.scoreValue === input.scoreValue &&
    stableStringify(latestSnapshot.factors) === stableStringify(input.factors)
  ) {
    return latestSnapshot;
  }

  const [snapshot] = await databaseClient
    .insert(scoreSnapshots)
    .values({
      calculationVersion: input.calculationVersion,
      factors: input.factors,
      personId: input.personId,
      scoreLevel: input.scoreLevel,
      scoreValue: input.scoreValue,
    })
    .returning();

  if (!snapshot) {
    throw new Error("Failed to persist attention score snapshot.");
  }

  return snapshot;
}
