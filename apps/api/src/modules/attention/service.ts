import { AttentionProfileResponseSchema, normalizeName } from "@peruvigia/shared";

import { db } from "#api/db/index.ts";
import { getContraloriaStatus } from "#api/modules/contraloria/service.ts";
import { getDjiContext } from "#api/modules/dji/service.ts";
import { getSeaceActivity } from "#api/modules/seace/service.ts";
import { buildAttentionMatches } from "./match.ts";
import {
  getPersonRecord,
  listSourceAliasCandidates,
  listSupplierRelationships,
  persistScoreSnapshot,
  upsertSearchAliasesForPerson,
} from "./repository.ts";
import { buildAttentionScore } from "./score.ts";
import { deriveAttentionSignals } from "./signals.ts";
import type { SourceAliasCandidate } from "./types.ts";

type DatabaseClient = typeof db;

function dedupeAliases(aliases: SourceAliasCandidate[]) {
  const aliasesByNormalizedValue = new Map<string, SourceAliasCandidate>();

  for (const alias of aliases) {
    const current = aliasesByNormalizedValue.get(alias.normalizedAlias);
    if (
      !current ||
      alias.confidence > current.confidence ||
      alias.alias.length > current.alias.length
    ) {
      aliasesByNormalizedValue.set(alias.normalizedAlias, alias);
    }
  }

  return [...aliasesByNormalizedValue.values()].sort((left, right) =>
    left.normalizedAlias.localeCompare(right.normalizedAlias),
  );
}

function dedupeSeaceActivityRecords<T extends { sourceRecordId: string }>(records: T[]) {
  return [...new Map(records.map((record) => [record.sourceRecordId, record])).values()];
}

export async function getAttentionProfile(personId: string, databaseClient: DatabaseClient = db) {
  const person = await getPersonRecord(personId, databaseClient);
  if (!person) {
    return null;
  }

  const [djiContext, contraloriaStatus, supplierRelationships, sourceAliases] = await Promise.all([
    getDjiContext(personId, databaseClient),
    getContraloriaStatus(personId, databaseClient),
    listSupplierRelationships(personId, databaseClient),
    listSourceAliasCandidates(personId, databaseClient),
  ]);

  const resolvedDjiContext = djiContext ?? {
    entityLinks: [],
    personId,
    personLinks: [],
  };
  const resolvedContraloriaStatus = contraloriaStatus ?? {
    activeSignals: [],
    contextSignals: [],
    hasActiveSanction: false,
    personId,
  };

  const supplierExternalIds = supplierRelationships
    .map((relationship) => relationship.entity.externalIdentifier)
    .filter((identifier): identifier is string => !!identifier);
  const commercialEntityExternalIds = resolvedDjiContext.entityLinks
    .filter((link) => link.linkType === "commercial")
    .map((link) => link.entity.externalIdentifier)
    .filter((identifier): identifier is string => !!identifier);

  const [supplierAwards, commercialEntityAwards] = await Promise.all([
    Promise.all(
      supplierExternalIds.map((supplierExternalId) =>
        getSeaceActivity(
          {
            limit: 500,
            supplierExternalId,
          },
          databaseClient,
        ),
      ),
    ).then((entries) => dedupeSeaceActivityRecords(entries.flat())),
    Promise.all(
      commercialEntityExternalIds.flatMap((externalIdentifier) => [
        getSeaceActivity(
          {
            limit: 500,
            supplierExternalId: externalIdentifier,
          },
          databaseClient,
        ),
        getSeaceActivity(
          {
            contractingEntityExternalId: externalIdentifier,
            limit: 500,
          },
          databaseClient,
        ),
      ]),
    ).then((entries) => dedupeSeaceActivityRecords(entries.flat())),
  ]);

  const aliases = dedupeAliases([
    {
      alias: person.fullName,
      confidence: 1,
      normalizedAlias: normalizeName(person.fullName),
      sourceRecordId: null,
    },
    ...sourceAliases,
  ]);

  await upsertSearchAliasesForPerson(personId, aliases, databaseClient);

  const matches = buildAttentionMatches({
    commercialEntityAwards,
    djiContext: resolvedDjiContext,
    supplierAwards,
    supplierRelationships,
  });
  const signals = deriveAttentionSignals({
    aliases,
    contraloriaStatus: resolvedContraloriaStatus,
    djiContext: resolvedDjiContext,
    matches,
    person,
    supplierRelationships,
  });
  const context = {
    activeSanctionsCount: resolvedContraloriaStatus.activeSignals.length,
    aliases: aliases.map((alias) => alias.alias),
    awardsCount: dedupeSeaceActivityRecords([...supplierAwards, ...commercialEntityAwards]).length,
    entityLinksCount: resolvedDjiContext.entityLinks.length,
    personLinksCount: resolvedDjiContext.personLinks.length,
    relatedSuppliersCount: supplierRelationships.length,
  };
  const computed = buildAttentionScore({
    context,
    factors: signals,
    personId,
    personFullName: person.fullName,
  });
  const snapshot = await persistScoreSnapshot(
    {
      calculationVersion: computed.calculationVersion,
      factors: computed.snapshotFactors,
      personId,
      scoreLevel: computed.score.level,
      scoreValue: computed.score.value,
    },
    databaseClient,
  );

  return AttentionProfileResponseSchema.parse({
    ...computed,
    calculatedAt: snapshot.calculatedAt.toISOString(),
    personId,
  });
}

export async function recalculateAttentionProfiles(
  personIds: string[],
  databaseClient: DatabaseClient = db,
) {
  const uniquePersonIds = [...new Set(personIds)].sort((left, right) => left.localeCompare(right));

  for (const personId of uniquePersonIds) {
    await getAttentionProfile(personId, databaseClient);
  }

  return uniquePersonIds;
}
