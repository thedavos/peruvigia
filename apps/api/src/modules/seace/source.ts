import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import {
  compactText,
  normalizeCatalogTitle,
  normalizeOpenDataCatalogEntries,
  normalizeWhitespace,
  parseCsvRecords,
  parseJsonRecords,
  selectPreferredOpenDataResource,
} from "@peruvigia/shared";

import { fetchResponse } from "#api/fetch";
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
} from "./types";

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

const DIRECT_SEACE_RESOURCES: Record<SeaceDatasetKind, SeaceResolvedResource> = {
  awards: {
    datasetId: "b6ee58ba-a130-45cd-aa21-707d4d8e3fef",
    format: "html",
    kind: "awards",
    modifiedAt: null,
    sourceUrl:
      "https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adatosabiertosadjudicaciones.html/content?password=key&userid=public",
    title: "Datos de la Adjudicacion",
  },
  contracting_entities: {
    datasetId: "20217",
    format: "csv",
    kind: "contracting_entities",
    modifiedAt: null,
    sourceUrl:
      "https://osce-gob-pe.atlassian.net/wiki/download/attachments/106889265/entidades_contratantes.csv?api=v2",
    title: "Entidades Contratantes",
  },
  rnp_people: {
    datasetId: "dd592c94-ba02-426e-8c38-918cf3f22597",
    format: "csv",
    kind: "rnp_people",
    modifiedAt: null,
    sourceUrl:
      "https://osce-gob-pe.atlassian.net/wiki/download/attachments/106889267/conformacion_juridica.csv?api=v2",
    title:
      "Personas declaradas en la conformacion juridica de proveedores en el Registro Nacional de Proveedores",
  },
};

type PrimitiveCell = string | number | boolean | Date | null;
type WorkbookRecord = Record<string, unknown>;

function decodeHtmlAttribute(value: string) {
  return value.replaceAll("&amp;", "&");
}

function toAbsoluteUrl(candidate: string, baseUrl: string) {
  return new URL(candidate, baseUrl).toString();
}

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

async function fetchBuffer(url: string, fetchImpl: typeof fetch) {
  const response = await fetchResponse(url, fetchImpl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    lastModified: response.headers.get("last-modified"),
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

function cellValueToPrimitive(value: ExcelJS.CellValue | undefined): PrimitiveCell {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return compactText(
      value
        .map((item) => cellValueToPrimitive(item as ExcelJS.CellValue))
        .filter((item): item is string | number | boolean | Date => item != null)
        .map((item) => String(item))
        .join(" "),
    );
  }

  if ("result" in value) {
    return cellValueToPrimitive(value.result as ExcelJS.CellValue | undefined);
  }

  if ("richText" in value) {
    return compactText(value.richText.map((item) => item.text).join(""));
  }

  if ("text" in value && typeof value.text === "string") {
    return compactText(value.text);
  }

  if ("hyperlink" in value) {
    return compactText(typeof value.text === "string" ? value.text : String(value.hyperlink ?? ""));
  }

  if ("error" in value) {
    return compactText(String(value.error));
  }

  return compactText(String(value));
}

function stringifyCellValue(value: PrimitiveCell) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return compactText(String(value));
}

function rowsFromWorksheet(worksheet: ExcelJS.Worksheet) {
  const rows: string[][] = [];

  worksheet.eachRow(
    {
      includeEmpty: false,
    },
    (row) => {
      const values: string[] = [];

      for (let columnIndex = 1; columnIndex <= row.cellCount; columnIndex += 1) {
        values.push(stringifyCellValue(cellValueToPrimitive(row.getCell(columnIndex).value)) ?? "");
      }

      if (values.some((value) => value.length > 0)) {
        rows.push(values);
      }
    },
  );

  return rows;
}

async function parseWorkbookRecords(workbookData: Buffer): Promise<WorkbookRecord[]> {
  const workbook = new ExcelJS.Workbook();
  const workbookBuffer = Buffer.from(workbookData);
  const workbookInput = workbookBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookInput);

  const records: WorkbookRecord[] = [];

  for (const worksheet of workbook.worksheets) {
    const rows = rowsFromWorksheet(worksheet);
    const [headerRow, ...dataRows] = rows;
    if (!headerRow || dataRows.length === 0) {
      continue;
    }

    const headers = headerRow.map(
      (header, index) => normalizeWhitespace(header) || `column_${index + 1}`,
    );

    for (const row of dataRows) {
      const record = Object.fromEntries(
        headers.map((header, index) => [header, compactText(row[index] ?? "")]),
      );

      if (Object.values(record).some((value) => value != null && String(value).length > 0)) {
        records.push(record);
      }
    }
  }

  return records;
}

function extractAwardWorkbookUrls(html: string, baseUrl: string) {
  const matches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: decodeHtmlAttribute(match[1] ?? ""),
      text: compactText((match[2] ?? "").replace(/<[^>]+>/g, " ")) ?? "",
    }))
    .filter(
      (match) =>
        match.href.length > 0 && match.text.toLowerCase() === "descargar todos los procesos",
    )
    .map((match) => toAbsoluteUrl(match.href, baseUrl))
    .filter((href, index, values) => values.indexOf(href) === index);

  if (matches.length === 0) {
    throw new Error(`Could not find award workbook downloads in ${baseUrl}.`);
  }

  return matches.sort();
}

async function resolveAwardDataset(
  resource: SeaceResolvedResource,
  fetchImpl: typeof fetch,
): Promise<SeaceDownloadedDataset> {
  const { body, contentType } = await fetchText(resource.sourceUrl, fetchImpl);
  const workbookUrls = extractAwardWorkbookUrls(body, resource.sourceUrl);
  const records: WorkbookRecord[] = [];
  let latestModifiedAt = resource.modifiedAt;

  for (const workbookUrl of workbookUrls) {
    const workbookResponse = await fetchBuffer(workbookUrl, fetchImpl);
    const workbookRecords = await parseWorkbookRecords(workbookResponse.buffer);
    records.push(...workbookRecords);

    if (workbookResponse.lastModified) {
      latestModifiedAt = workbookResponse.lastModified;
    }
  }

  return {
    body,
    contentType,
    format: "xlsx",
    kind: resource.kind,
    modifiedAt: latestModifiedAt,
    records,
    sourceUrl: resource.sourceUrl,
    title: resource.title,
  };
}

async function loadInputDirDatasets(inputDir: string) {
  const entries = await readdir(inputDir, {
    withFileTypes: true,
  });
  const resolved = new Map<SeaceDatasetKind, SeaceDownloadedDataset>();

  for (const kind of SEACE_DATASET_KINDS) {
    for (const candidateFormat of ["csv", "json", "xlsx", "html"] as const) {
      const fileName = `${kind}.${candidateFormat}`;
      const entry = entries.find((candidate) => candidate.isFile() && candidate.name === fileName);
      if (!entry) {
        continue;
      }

      const absolutePath = path.join(inputDir, fileName);
      if (candidateFormat === "xlsx") {
        const workbookData = await readFile(absolutePath);
        resolved.set(kind, {
          body: "",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          format: candidateFormat,
          kind,
          modifiedAt: null,
          records: await parseWorkbookRecords(workbookData),
          sourceUrl: new URL(`file://${absolutePath}`).toString(),
          title: fileName,
        });
        break;
      }

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

  let resolvedResources = new Map<SeaceDatasetKind, SeaceResolvedResource>();

  try {
    const catalogEntries = await fetchCatalogEntries(fetchImpl);
    resolvedResources = resolveSeaceResourcesFromCatalog(catalogEntries);
  } catch {
    resolvedResources = new Map();
  }

  for (const kind of SEACE_REQUIRED_DATASET_KINDS) {
    if (!resolvedResources.has(kind)) {
      resolvedResources.set(kind, DIRECT_SEACE_RESOURCES[kind]);
    }
  }

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

      if (resource.kind === "awards") {
        return await resolveAwardDataset(resource, fetchImpl);
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
