import type {
  AttentionFactor,
  AttentionFactorKey,
  AttentionProfileResponse,
  ContraloriaStatusResponse,
  DjiContextResponse,
} from "@peruvigia/shared";

import type { SeaceActivityRecord } from "#api/modules/seace/types.ts";

export type AttentionEvidenceRef = AttentionFactor["evidence"][number];

export type SupplierRelationshipRecord = {
  declaredRole: string | null;
  detail: string | null;
  entity: {
    entityId: string;
    entityType: string;
    externalIdentifier: string | null;
    name: string;
  };
  evidence: {
    observedAt: string | null;
    sourceExternalId: string | null;
    sourceRecordId: string;
    sourceUrl: string | null;
  };
  linkId: string;
};

export type SourceAliasCandidate = {
  alias: string;
  confidence: number;
  normalizedAlias: string;
  sourceRecordId: string | null;
};

export type DerivedAttentionSignal = {
  contribution: number;
  evidence: AttentionEvidenceRef[];
  isPenalizable: boolean;
  key: AttentionFactorKey;
  label: string;
  metadata: Record<string, unknown>;
  summary: string;
  weight: number;
};

export type AttentionMatchInput = {
  commercialEntityAwards: SeaceActivityRecord[];
  djiContext: DjiContextResponse;
  supplierAwards: SeaceActivityRecord[];
  supplierRelationships: SupplierRelationshipRecord[];
};

export type CommercialEntityMatch = {
  awards: SeaceActivityRecord[];
  entityLink: DjiContextResponse["entityLinks"][number];
  supplierRelationships: SupplierRelationshipRecord[];
};

export type SupplierProviderMatch = {
  awards: SeaceActivityRecord[];
  supplierRelationship: SupplierRelationshipRecord;
};

export type AttentionMatches = {
  commercialEntityMatches: CommercialEntityMatch[];
  supplierProviderMatches: SupplierProviderMatch[];
};

export type AttentionContextInput = {
  aliases: SourceAliasCandidate[];
  contraloriaStatus: ContraloriaStatusResponse;
  djiContext: DjiContextResponse;
  matches: AttentionMatches;
  person: {
    documentNumber: string | null;
    fullName: string;
    id: string;
    normalizedName: string;
  };
  supplierRelationships: SupplierRelationshipRecord[];
};

export type AttentionScoreInput = {
  context: AttentionProfileResponse["context"];
  factors: DerivedAttentionSignal[];
  personId: string;
  personFullName: string;
};

export type AttentionComputedProfile = Omit<AttentionProfileResponse, "calculatedAt"> & {
  snapshotFactors: Record<string, unknown>;
};
