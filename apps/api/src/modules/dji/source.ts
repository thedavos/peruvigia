import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { fetchResponse } from "#api/fetch";

import {
  compactText,
  normalizeCatalogTitle,
  normalizeOpenDataCatalogEntries,
  parseCsvRecords,
  parseJsonRecords,
  selectPreferredOpenDataResource,
} from "@peruvigia/shared";

import {
  DJI_CATALOG_URLS,
  DJI_DATASET_KINDS,
  DJI_REQUIRED_DATASET_KINDS,
  type DjiAcquireOptions,
  type DjiCatalogEntry,
  type DjiDatasetKind,
  type DjiDistributionFormat,
  type DjiDownloadedDataset,
  type DjiResolvedResource,
} from "./types";

const DATASET_KIND_KEYWORDS: Record<DjiDatasetKind, string[]> = {
  declarations: ["declaraciones", "declarantes", "declaracion jurada"],
  employment: ["empleo", "empleos", "laboral", "laborales"],
  commercial: ["empresa", "empresas", "sociedad", "sociedades", "comercial", "comerciales"],
  family: ["familia", "familiares", "familiar", "parentesco"],
  guild: ["gremio", "gremios", "gremial", "gremiales"],
  board_membership: ["organo colegiado", "organos colegiados", "organo", "colegiado", "colegiados"],
};

const DISTRIBUTION_PRIORITY: DjiDistributionFormat[] = ["json", "csv", "xml"];

function inferDatasetKind(title: string) {
  const normalizedTitle = normalizeCatalogTitle(title);

  if (
    DATASET_KIND_KEYWORDS.family.some((keyword) => normalizedTitle.includes(keyword)) &&
    !normalizedTitle.includes("grupo familiar")
  ) {
    return "family";
  }

  if (DATASET_KIND_KEYWORDS.employment.some((keyword) => normalizedTitle.includes(keyword))) {
    return "employment";
  }

  if (DATASET_KIND_KEYWORDS.commercial.some((keyword) => normalizedTitle.includes(keyword))) {
    return "commercial";
  }

  if (DATASET_KIND_KEYWORDS.guild.some((keyword) => normalizedTitle.includes(keyword))) {
    return "guild";
  }

  if (DATASET_KIND_KEYWORDS.board_membership.some((keyword) => normalizedTitle.includes(keyword))) {
    return "board_membership";
  }

  if (
    DATASET_KIND_KEYWORDS.declarations.some((keyword) => normalizedTitle.includes(keyword)) &&
    !normalizedTitle.includes("empleo") &&
    !normalizedTitle.includes("familia") &&
    !normalizedTitle.includes("empresa") &&
    !normalizedTitle.includes("gremio") &&
    !normalizedTitle.includes("colegiado")
  ) {
    return "declarations";
  }

  return null;
}

export function resolveDjiResourcesFromCatalog(entries: DjiCatalogEntry[]) {
  const resolvedResources = new Map<DjiDatasetKind, DjiResolvedResource>();

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

  return await response.text();
}

async function fetchCatalogEntries(fetchImpl: typeof fetch) {
  const errors: string[] = [];

  for (const catalogUrl of DJI_CATALOG_URLS) {
    try {
      const payload = await fetchJson(catalogUrl, fetchImpl);
      const entries = normalizeOpenDataCatalogEntries(payload);
      if (entries.length > 0) {
        return entries as DjiCatalogEntry[];
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Could not resolve DJI catalog metadata. ${errors.join(" | ")}`.trim());
}

function parseXmlScalar(value: string) {
  const text = compactText(value);
  if (text == null) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }

  return text;
}

function parseXmlRows(text: string) {
  const normalized = text.replace(/<\?xml[^>]*>/gi, "").trim();
  const rowMatches = [...normalized.matchAll(/<(row|record|item)[^>]*>([\s\S]*?)<\/\1>/gi)];

  return rowMatches
    .map((match) => {
      const body = match[2] ?? "";
      const fields = [...body.matchAll(/<([A-Za-z0-9_:-]+)[^>]*>([\s\S]*?)<\/\1>/g)];
      if (fields.length === 0) {
        return null;
      }

      return Object.fromEntries(
        fields.map((fieldMatch) => [fieldMatch[1] ?? "", parseXmlScalar(fieldMatch[2] ?? "")]),
      ) as Record<string, unknown>;
    })
    .filter((row): row is Record<string, unknown> => row != null);
}

function parseDatasetBody(format: DjiDistributionFormat, body: string) {
  if (format === "json") {
    return parseJsonRecords(JSON.parse(body));
  }

  if (format === "csv") {
    return parseCsvRecords(body);
  }

  return parseXmlRows(body);
}

async function loadInputDirDatasets(inputDir: string) {
  const entries = await readdir(inputDir, {
    withFileTypes: true,
  });
  const resolved = new Map<DjiDatasetKind, DjiDownloadedDataset>();

  for (const kind of DJI_DATASET_KINDS) {
    for (const format of DISTRIBUTION_PRIORITY) {
      const fileName = `${kind}.${format}`;
      const entry = entries.find((candidate) => candidate.isFile() && candidate.name === fileName);
      if (!entry) {
        continue;
      }

      const absolutePath = path.join(inputDir, fileName);
      const body = await readFile(absolutePath, "utf8");
      resolved.set(kind, {
        format,
        kind,
        modifiedAt: null,
        rows: parseDatasetBody(format, body),
        sourceUrl: new URL(`file://${absolutePath}`).toString(),
        title: fileName,
      });
      break;
    }
  }

  const missingKinds = DJI_REQUIRED_DATASET_KINDS.filter((kind) => !resolved.has(kind));
  if (missingKinds.length > 0) {
    throw new Error(`Missing DJI datasets in ${inputDir}: ${missingKinds.join(", ")}`);
  }

  return [...resolved.values()];
}

export async function acquireDjiDatasets(
  options: DjiAcquireOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<DjiDownloadedDataset[]> {
  if (options.inputDir) {
    return await loadInputDirDatasets(options.inputDir);
  }

  const catalogEntries = await fetchCatalogEntries(fetchImpl);
  const resolvedResources = resolveDjiResourcesFromCatalog(catalogEntries);
  const missingKinds = DJI_REQUIRED_DATASET_KINDS.filter((kind) => !resolvedResources.has(kind));

  if (missingKinds.length > 0) {
    throw new Error(
      `Could not resolve all DJI datasets from catalog metadata: ${missingKinds.join(", ")}`,
    );
  }

  return await Promise.all(
    [...resolvedResources.keys()].map(async (kind) => {
      const resource = resolvedResources.get(kind);
      if (!resource) {
        throw new Error(`Missing resolved DJI resource for ${kind}.`);
      }

      const body = await fetchText(resource.sourceUrl, fetchImpl);
      return {
        format: resource.format,
        kind,
        modifiedAt: resource.modifiedAt,
        rows: parseDatasetBody(resource.format, body),
        sourceUrl: resource.sourceUrl,
        title: resource.title,
      } satisfies DjiDownloadedDataset;
    }),
  );
}

export { inferDatasetKind, parseXmlRows };
