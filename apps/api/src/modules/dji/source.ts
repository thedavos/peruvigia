import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { compactText, normalizeForComparison, normalizeKey, normalizeWhitespace } from "@shared";

import {
  DJI_CATALOG_URLS,
  DJI_DATASET_KINDS,
  DJI_REQUIRED_DATASET_KINDS,
  type DjiAcquireOptions,
  type DjiCatalogEntry,
  type DjiCatalogResource,
  type DjiDatasetKind,
  type DjiDistributionFormat,
  type DjiDownloadedDataset,
  type DjiResolvedResource,
} from "./types.js";

const DATASET_KIND_KEYWORDS: Record<DjiDatasetKind, string[]> = {
  declarations: ["declaraciones", "declarantes", "declaracion jurada"],
  employment: ["empleo", "empleos", "laboral", "laborales"],
  commercial: ["empresa", "empresas", "sociedad", "sociedades", "comercial", "comerciales"],
  family: ["familia", "familiares", "familiar", "parentesco"],
  guild: ["gremio", "gremios", "gremial", "gremiales"],
  board_membership: [
    "organo colegiado",
    "organos colegiados",
    "organo",
    "colegiado",
    "colegiados",
  ],
};

const DISTRIBUTION_PRIORITY: DjiDistributionFormat[] = ["json", "csv", "xml"];

function toAbsoluteUrl(candidate: string, baseUrl: string) {
  return new URL(candidate, baseUrl).toString();
}

function normalizeDatasetTitle(value: string) {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferDistributionFormat(resource: Pick<DjiCatalogResource, "format" | "url">) {
  const normalizedFormat = normalizeKey(resource.format ?? "");
  if (normalizedFormat === "json" || normalizedFormat === "csv" || normalizedFormat === "xml") {
    return normalizedFormat;
  }

  const url = resource.url?.toLowerCase() ?? "";
  if (url.endsWith(".json")) {
    return "json";
  }

  if (url.endsWith(".csv")) {
    return "csv";
  }

  if (url.endsWith(".xml")) {
    return "xml";
  }

  return null;
}

function inferDatasetKind(title: string) {
  const normalizedTitle = normalizeDatasetTitle(title);

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

  if (
    DATASET_KIND_KEYWORDS.board_membership.some((keyword) => normalizedTitle.includes(keyword))
  ) {
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

function normalizeCatalogEntries(payload: unknown): DjiCatalogEntry[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if ("dataset" in payload && Array.isArray((payload as { dataset?: unknown[] }).dataset)) {
    return ((payload as { dataset: unknown[] }).dataset ?? [])
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const distribution = Array.isArray((entry as { distribution?: unknown[] }).distribution)
          ? ((entry as { distribution: unknown[] }).distribution ?? [])
          : [];

        return {
          id: compactText(String((entry as { identifier?: unknown }).identifier ?? "")),
          modifiedAt: compactText(String((entry as { modified?: unknown }).modified ?? "")),
          resources: distribution
            .map((resource) => {
              if (!resource || typeof resource !== "object") {
                return null;
              }

              return {
                format: compactText(String((resource as { format?: unknown }).format ?? "")),
                title: compactText(String((resource as { title?: unknown }).title ?? "")),
                url: compactText(
                  String(
                    (resource as { accessURL?: unknown; downloadURL?: unknown }).downloadURL ??
                      (resource as { accessURL?: unknown }).accessURL ??
                      "",
                  ),
                ),
              } satisfies DjiCatalogResource;
            })
            .filter((resource): resource is DjiCatalogResource => resource != null),
          title: compactText(String((entry as { title?: unknown }).title ?? "")) ?? "untitled",
        } satisfies DjiCatalogEntry;
      })
      .filter((entry): entry is DjiCatalogEntry => entry != null);
  }

  const results = ((payload as { result?: { results?: unknown[] } }).result?.results ?? []) as unknown[];
  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const resources = Array.isArray((entry as { resources?: unknown[] }).resources)
        ? ((entry as { resources: unknown[] }).resources ?? [])
        : [];

      return {
        id: compactText(String((entry as { id?: unknown; name?: unknown }).id ?? "")) ??
          compactText(String((entry as { name?: unknown }).name ?? "")),
        modifiedAt: compactText(String((entry as { metadata_modified?: unknown }).metadata_modified ?? "")),
        resources: resources
          .map((resource) => {
            if (!resource || typeof resource !== "object") {
              return null;
            }

            return {
              format: compactText(String((resource as { format?: unknown }).format ?? "")),
              title: compactText(String((resource as { name?: unknown }).name ?? "")),
              url: compactText(String((resource as { url?: unknown }).url ?? "")),
            } satisfies DjiCatalogResource;
          })
          .filter((resource): resource is DjiCatalogResource => resource != null),
        title: compactText(String((entry as { title?: unknown }).title ?? "")) ?? "untitled",
      } satisfies DjiCatalogEntry;
    })
    .filter((entry): entry is DjiCatalogEntry => entry != null);
}

function selectPreferredResource(
  resources: DjiCatalogResource[],
  title: string,
): Pick<DjiResolvedResource, "format" | "sourceUrl"> | null {
  for (const format of DISTRIBUTION_PRIORITY) {
    const match = resources.find((resource) => inferDistributionFormat(resource) === format && resource.url);

    if (match?.url) {
      return {
        format,
        sourceUrl: match.url,
      };
    }
  }

  const inlineMatch = resources.find((resource) => resource.url);
  if (!inlineMatch?.url) {
    return null;
  }

  const inferredFormat = inferDistributionFormat(inlineMatch);
  if (!inferredFormat) {
    throw new Error(`Unsupported DJI resource format for ${title}.`);
  }

  return {
    format: inferredFormat,
    sourceUrl: inlineMatch.url,
  };
}

export function resolveDjiResourcesFromCatalog(entries: DjiCatalogEntry[]) {
  const resolvedResources = new Map<DjiDatasetKind, DjiResolvedResource>();

  for (const entry of entries) {
    const kind = inferDatasetKind(entry.title);
    if (!kind || resolvedResources.has(kind)) {
      continue;
    }

    const resource = selectPreferredResource(entry.resources, entry.title);
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
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchText(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url);
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
      const entries = normalizeCatalogEntries(payload);
      if (entries.length > 0) {
        return entries;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Could not resolve DJI catalog metadata. ${errors.join(" | ")}`.trim());
}

function parseJsonRows(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidates = [
    (payload as { records?: unknown }).records,
    (payload as { data?: unknown }).data,
    (payload as { result?: { records?: unknown } }).result?.records,
    (payload as { result?: unknown[] }).result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
    }
  }

  return [];
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    const nextCharacter = text[index + 1] ?? "";

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentField += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      currentField = "";

      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += character;
  }

  currentRow.push(currentField);
  if (currentRow.some((field) => field.length > 0)) {
    rows.push(currentRow);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((column) => normalizeWhitespace(column));
  return dataRows
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, compactText(row[index] ?? "")])),
    )
    .filter((row) => Object.values(row).some((value) => value != null)) as Array<Record<string, unknown>>;
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
      );
    })
    .filter((row): row is Record<string, unknown> => row != null);
}

function parseDatasetBody(format: DjiDistributionFormat, body: string) {
  if (format === "json") {
    return parseJsonRows(JSON.parse(body));
  }

  if (format === "csv") {
    return parseCsvRows(body);
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
    throw new Error(`Could not resolve all DJI datasets from catalog metadata: ${missingKinds.join(", ")}`);
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

export { inferDatasetKind, normalizeCatalogEntries, parseCsvRows, parseXmlRows };
