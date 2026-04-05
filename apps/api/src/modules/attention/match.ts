import type { SeaceActivityRecord } from "#api/modules/seace/types.ts";
import type {
  AttentionMatchInput,
  AttentionMatches,
  CommercialEntityMatch,
  SupplierProviderMatch,
} from "./types.ts";

function dedupeActivityRecords(records: SeaceActivityRecord[]) {
  const recordsBySourceRecordId = new Map<string, SeaceActivityRecord>();

  for (const record of records) {
    recordsBySourceRecordId.set(record.sourceRecordId, record);
  }

  return [...recordsBySourceRecordId.values()].sort((left, right) =>
    right.observedAt.localeCompare(left.observedAt),
  );
}

export function buildAttentionMatches(input: AttentionMatchInput): AttentionMatches {
  const commercialEntityMatches: CommercialEntityMatch[] = [];
  const supplierProviderMatches: SupplierProviderMatch[] = [];

  for (const entityLink of input.djiContext.entityLinks) {
    if (entityLink.linkType !== "commercial" || !entityLink.entity.externalIdentifier) {
      continue;
    }

    const supplierRelationships = input.supplierRelationships.filter(
      (relationship) =>
        relationship.entity.externalIdentifier != null &&
        relationship.entity.externalIdentifier === entityLink.entity.externalIdentifier,
    );

    const awards = dedupeActivityRecords(
      input.commercialEntityAwards.filter(
        (award) =>
          award.supplier.externalIdentifier === entityLink.entity.externalIdentifier ||
          award.contractingEntity.externalIdentifier === entityLink.entity.externalIdentifier,
      ),
    );

    if (supplierRelationships.length === 0 && awards.length === 0) {
      continue;
    }

    commercialEntityMatches.push({
      awards,
      entityLink,
      supplierRelationships,
    });
  }

  for (const supplierRelationship of input.supplierRelationships) {
    const externalIdentifier = supplierRelationship.entity.externalIdentifier;
    if (!externalIdentifier) {
      continue;
    }

    const awards = dedupeActivityRecords(
      input.supplierAwards.filter(
        (award) => award.supplier.externalIdentifier === externalIdentifier,
      ),
    );

    if (awards.length === 0) {
      continue;
    }

    supplierProviderMatches.push({
      awards,
      supplierRelationship,
    });
  }

  return {
    commercialEntityMatches,
    supplierProviderMatches,
  };
}
