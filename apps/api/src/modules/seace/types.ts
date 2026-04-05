export const SEACE_SOURCE_TYPE = "osce_seace";

export const SEACE_DATASET_KINDS = ["rnp_people", "awards", "contracting_entities"] as const;

export const SEACE_REQUIRED_DATASET_KINDS = [
  "rnp_people",
  "awards",
  "contracting_entities",
] as const;

export const SEACE_DISTRIBUTION_FORMATS = ["csv", "json", "html", "data"] as const;

export const SEACE_CATALOG_URLS = [
  "https://www.datosabiertos.gob.pe/data.json",
  "https://www.datosabiertos.gob.pe/api/3/action/package_search?rows=1000&q=osce",
] as const;

export type SeaceDatasetKind = (typeof SEACE_DATASET_KINDS)[number];
export type SeaceDistributionFormat = (typeof SEACE_DISTRIBUTION_FORMATS)[number];

export type SeaceAcquireOptions = {
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
