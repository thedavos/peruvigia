import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeCatalogTitle,
  normalizeOpenDataCatalogEntries,
  parseCsvRecords,
  parseJsonRecords,
  selectPreferredOpenDataResource,
} from "@peruvigia/shared";

import { fetchResponse } from "#api/fetch.js";
import {
  SEACE_CATALOG_URLS,
  SEACE_DATASET_KINDS,
  SEACE_REQUIRED_DATASET_KINDS,
  type SeaceAcquireOptions,
  type SeaceCatalogEntry,
  type SeaceDatasetKind,
  type SeaceDistributionFormat,
  type SeaceDownloadedDataset,
  type SeaceResolvedResource,
} from "./types.js";

const DATASET_KIND_KEYWORDS: Record<SeaceDatasetKind, string[]> = {
  awards: ["datos de la adjudicacion", "adjudicacion", "buena pro"],
  contracting_entities: ["entidades contratantes", "tabla maestra de entidades"],
  rnp_people: [
    "personas declaradas",
    "conformacion juridica",
    "registro nacional de proveedores",
    "rnp",
  ],
};

const DISTRIBUTION_PRIORITY: SeaceDistributionFormat[] = ["csv", "json", "html", "data"];

function inferDatasetKind(title: string) {
  const normalizedTitle = normalizeCatalogTitle(title);

  if (
    DATASET_KIND_KEYWORDS.rnp_people.every((keyword) =>
      normalizedTitle.includes(keyword.replace(/\s+/g, " ").trim()),
    ) ||
    (normalizedTitle.includes("personas declaradas") &&
      normalizedTitle.includes("conformacion juridica") &&
      normalizedTitle.includes("proveedores"))
  ) {
    return "rnp_people";
  }

  if (
    DATASET_KIND_KEYWORDS.contracting_entities.some((keyword) => normalizedTitle.includes(keyword))
  ) {
    return "contracting_entities";
  }

  if (
    DATASET_KIND_KEYWORDS.awards.some((keyword) => normalizedTitle.includes(keyword)) &&
    !normalizedTitle.includes("convocatoria")
  ) {
    return "awards";
  }

  return null;
}

export function resolveSeaceResourcesFromCatalog(entries: SeaceCatalogEntry[]) {
  const resolvedResources = new Map<SeaceDatasetKind, SeaceResolvedResource>();

  for (const entry of entries) {
    const kind = inferDatasetKind(entry.title);
    if (!kind || resolvedResources.has(kind)) {
      continue;
    }

    const resource = selectPreferredOpenDataResource(
      entry.resources,
      DISTRIBUTION_PRIORITY,
      entry.title,
    );
    if (!resource) {
      continue;
    }

    resolvedResources.set(kind, {
      datasetId: entry.id,
      format: resource.format,
      kind,
      modifiedAt: entry.modifiedAt,
      sourceUrl: resource.sourceUrl,
      title: entry.title,
    });
  }

  return resolvedResources;
}

async function fetchJson(url: string, fetchImpl: typeof fetch) {
  const response = await fetchResponse(url, fetchImpl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchText(url: string, fetchImpl: typeof fetch) {
  const response = await fetchResponse(url, fetchImpl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return {
    body: await response.text(),
    contentType: response.headers.get("content-type"),
  };
}

async function fetchCatalogEntries(fetchImpl: typeof fetch) {
  const errors: string[] = [];

  for (const catalogUrl of SEACE_CATALOG_URLS) {
    try {
      const payload = await fetchJson(catalogUrl, fetchImpl);
      const entries = normalizeOpenDataCatalogEntries(payload);
      if (entries.length > 0) {
        return entries as SeaceCatalogEntry[];
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Could not resolve SEACE catalog metadata. ${errors.join(" | ")}`.trim());
}

function parseDatasetBody(format: SeaceDistributionFormat, body: string) {
  if (format === "json") {
    return parseJsonRecords(JSON.parse(body));
  }

  if (format === "csv") {
    return parseCsvRecords(body);
  }

  return null;
}

async function loadInputDirDatasets(inputDir: string) {
  const entries = await readdir(inputDir, {
    withFileTypes: true,
  });
  const resolved = new Map<SeaceDatasetKind, SeaceDownloadedDataset>();

  for (const kind of SEACE_DATASET_KINDS) {
    for (const candidateFormat of ["csv", "json", "html"] as const) {
      const fileName = `${kind}.${candidateFormat}`;
      const entry = entries.find((candidate) => candidate.isFile() && candidate.name === fileName);
      if (!entry) {
        continue;
      }

      const absolutePath = path.join(inputDir, fileName);
      const body = await readFile(absolutePath, "utf8");
      resolved.set(kind, {
        body,
        contentType:
          candidateFormat === "csv"
            ? "text/csv"
            : candidateFormat === "json"
              ? "application/json"
              : "text/html",
        format: candidateFormat,
        kind,
        modifiedAt: null,
        records: parseDatasetBody(candidateFormat, body),
        sourceUrl: new URL(`file://${absolutePath}`).toString(),
        title: fileName,
      });
      break;
    }
  }

  const missingKinds = SEACE_REQUIRED_DATASET_KINDS.filter((kind) => !resolved.has(kind));
  if (missingKinds.length > 0) {
    throw new Error(`Missing SEACE datasets in ${inputDir}: ${missingKinds.join(", ")}`);
  }

  return [...resolved.values()];
}

export async function acquireSeaceDatasets(
  options: SeaceAcquireOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<SeaceDownloadedDataset[]> {
  if (options.inputDir) {
    return await loadInputDirDatasets(options.inputDir);
  }

  const catalogEntries = await fetchCatalogEntries(fetchImpl);
  const resolvedResources = resolveSeaceResourcesFromCatalog(catalogEntries);
  const missingKinds = SEACE_REQUIRED_DATASET_KINDS.filter((kind) => !resolvedResources.has(kind));

  if (missingKinds.length > 0) {
    throw new Error(
      `Could not resolve all SEACE datasets from catalog metadata: ${missingKinds.join(", ")}`,
    );
  }

  return await Promise.all(
    [...resolvedResources.keys()].map(async (kind) => {
      const resource = resolvedResources.get(kind);
      if (!resource) {
        throw new Error(`Missing resolved SEACE resource for ${kind}.`);
      }

      const { body, contentType } = await fetchText(resource.sourceUrl, fetchImpl);
      return {
        body,
        contentType,
        format: resource.format,
        kind,
        modifiedAt: resource.modifiedAt,
        records: parseDatasetBody(resource.format, body),
        sourceUrl: resource.sourceUrl,
        title: resource.title,
      } satisfies SeaceDownloadedDataset;
    }),
  );
}

export { inferDatasetKind };
