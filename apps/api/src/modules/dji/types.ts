import type {
  DjiContextResponse,
  DjiEntityLink,
  DjiLinkType,
  DjiPersonLink,
} from "@peruvigia/shared";

export const DJI_SOURCE_TYPE = "pcm_dji";

export const DJI_DATASET_KINDS = [
  "declarations",
  "employment",
  "commercial",
  "family",
  "guild",
  "board_membership",
] as const;

export const DJI_REQUIRED_DATASET_KINDS = ["declarations"] as const;

export const DJI_DISTRIBUTION_FORMATS = ["json", "csv", "xml"] as const;

export const DJI_CATALOG_URLS = [
  "https://www.datosabiertos.gob.pe/data.json",
  "https://www.datosabiertos.gob.pe/api/3/action/package_search?rows=1000&q=declaraciones%20juradas%20de%20intereses",
] as const;

export type DjiDatasetKind = (typeof DJI_DATASET_KINDS)[number];
export type DjiDistributionFormat = (typeof DJI_DISTRIBUTION_FORMATS)[number];

export type DjiSyncSummary = {
  downloaded: number;
  failed: number;
  inserted: number;
  processed: number;
  reused: number;
  skipped: number;
  updated: number;
};

export type DjiSyncResult = {
  affectedPersonIds: string[];
  errors: string[];
  summary: DjiSyncSummary;
};

export type DjiAcquireOptions = {
  allowBackfill?: boolean;
  inputDir?: string;
};

export type DjiCatalogResource = {
  format: string | null;
  title: string | null;
  url: string | null;
};

export type DjiCatalogEntry = {
  id: string | null;
  modifiedAt: string | null;
  resources: DjiCatalogResource[];
  title: string;
};

export type DjiResolvedResource = {
  datasetId: string | null;
  format: DjiDistributionFormat;
  kind: DjiDatasetKind;
  modifiedAt: string | null;
  sourceUrl: string;
  title: string;
};

export type DjiDownloadedDataset = {
  format: DjiDistributionFormat;
  kind: DjiDatasetKind;
  modifiedAt: string | null;
  rows: Array<Record<string, unknown>>;
  sourceUrl: string;
  title: string;
};

export type DjiNormalizedDeclaration = {
  currentPosition: string | null;
  declarationExternalId: string;
  documentNumber: string | null;
  entityLinks: DjiNormalizedEntityLink[];
  fullName: string;
  institutionName: string | null;
  normalizedName: string;
  observedAt: string;
  personLinks: DjiNormalizedPersonLink[];
  rawDeclaration: Record<string, unknown>;
  rawLinksByKind: Partial<Record<DjiDatasetKind, Array<Record<string, unknown>>>>;
  sourceUrl: string | null;
};

export type DjiNormalizedEntityLink = {
  detail: string | null;
  endDate: string | null;
  entityName: string;
  entityType: string;
  externalIdentifier: string;
  linkType: Exclude<DjiLinkType, "family">;
  metadata: Record<string, unknown>;
  normalizedEntityName: string;
  rawPayload: Record<string, unknown>;
  startDate: string | null;
};

export type DjiNormalizedPersonLink = {
  detail: string | null;
  documentNumber: string | null;
  endDate: string | null;
  fullName: string;
  linkType: Extract<DjiLinkType, "family">;
  metadata: Record<string, unknown>;
  normalizedName: string;
  rawPayload: Record<string, unknown>;
  startDate: string | null;
};

export type DjiContext = DjiContextResponse;
export type DjiContextEntityLink = DjiEntityLink;
export type DjiContextPersonLink = DjiPersonLink;
