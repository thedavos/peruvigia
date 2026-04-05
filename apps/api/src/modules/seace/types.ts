export const SEACE_SOURCE_TYPE = "osce_seace";

export const SEACE_DATASET_KINDS = ["rnp_people", "awards", "contracting_entities"] as const;

export const SEACE_REQUIRED_DATASET_KINDS = [
  "rnp_people",
  "awards",
  "contracting_entities",
] as const;

export const SEACE_DISTRIBUTION_FORMATS = ["csv", "json", "html", "data", "xlsx"] as const;

export const SEACE_CATALOG_URLS = [
  "https://www.datosabiertos.gob.pe/data.json",
  "https://www.datosabiertos.gob.pe/api/3/action/package_search?rows=1000&q=osce",
] as const;

export type SeaceDatasetKind = (typeof SEACE_DATASET_KINDS)[number];
export type SeaceDistributionFormat = (typeof SEACE_DISTRIBUTION_FORMATS)[number];

export type SeaceAcquireOptions = {
  allowBackfill?: boolean;
  inputDir?: string;
};

export type SeaceCatalogResource = {
  format: string | null;
  title: string | null;
  url: string | null;
};

export type SeaceCatalogEntry = {
  id: string | null;
  modifiedAt: string | null;
  resources: SeaceCatalogResource[];
  title: string;
};

export type SeaceResolvedResource = {
  datasetId: string | null;
  format: SeaceDistributionFormat;
  kind: SeaceDatasetKind;
  modifiedAt: string | null;
  sourceUrl: string;
  title: string;
};

export type SeaceDownloadedDataset = {
  body: string;
  contentType: string | null;
  format: SeaceDistributionFormat;
  kind: SeaceDatasetKind;
  modifiedAt: string | null;
  records: Array<Record<string, unknown>> | null;
  sourceUrl: string;
  title: string;
};

export type SeaceSyncSummary = {
  downloaded: number;
  failed: number;
  inserted: number;
  processed: number;
  reused: number;
  skipped: number;
  updated: number;
};

export type SeaceSyncResult = {
  errors: string[];
  summary: SeaceSyncSummary;
};

export type SeaceNormalizedRnpLink = {
  normalizedPersonName: string;
  normalizedProviderName: string;
  observedAt: string;
  personDocumentNumber: string | null;
  personDocumentType: string | null;
  personFullName: string;
  providerDocumentNumber: string | null;
  providerExternalId: string;
  providerName: string;
  rawPayload: Record<string, unknown>;
  relationshipType: string;
  sourceExternalId: string;
  sourceUrl: string | null;
};

export type SeaceNormalizedAward = {
  awardedAt: string | null;
  contractingEntityExternalId: string;
  contractingEntityName: string;
  currency: string | null;
  normalizedContractingEntityName: string;
  normalizedSupplierName: string;
  objectDescription: string | null;
  processExternalId: string;
  processType: string | null;
  rawPayload: Record<string, unknown>;
  sourceExternalId: string;
  sourceUrl: string | null;
  status: string | null;
  supplierDocumentNumber: string | null;
  supplierExternalId: string;
  supplierName: string;
  totalAmount: number | null;
};

export type SeaceNormalizedContractingEntity = {
  acronym: string | null;
  entityExternalId: string;
  entityName: string;
  governmentLevel: string | null;
  normalizedEntityName: string;
  rawPayload: Record<string, unknown>;
  sector: string | null;
  sourceExternalId: string;
  sourceUrl: string | null;
  status: string | null;
};

export type SeaceNormalizationResult = {
  awards: SeaceNormalizedAward[];
  contractingEntities: SeaceNormalizedContractingEntity[];
  errors: string[];
  rnpLinks: SeaceNormalizedRnpLink[];
  skipped: number;
};
