import {
  compactText,
  normalizeDocumentNumber,
  normalizeKey,
  normalizeName,
  parseIsoDate,
  parseCsvRecords,
  parseJsonRecords,
  readNameFromComponents,
  readRowString,
  slugify,
  toKeyedRow,
} from "@peruvigia/shared";
import { hashNormalizedPayload } from "@peruvigia/shared/node";

import type {
  SeaceDownloadedDataset,
  SeaceNormalizedAward,
  SeaceNormalizedContractingEntity,
  SeaceNormalizedRnpLink,
  SeaceNormalizationResult,
} from "./types.js";

const RNP_PROVIDER_NAME_ALIASES = [
  "razonsocial",
  "razon_social",
  "proveedor",
  "nombreproveedor",
  "nombre_proveedor",
];

const RNP_PROVIDER_DOCUMENT_ALIASES = [
  "rucproveedor",
  "ruc_proveedor",
  "numeroruc",
  "nro_ruc",
  "ruc",
];

const RNP_PERSON_NAME_ALIASES = [
  "apellidosynombres",
  "nombresyapellidos",
  "nombrecompleto",
  "persona",
  "integrante",
  "representantelegal",
];

const RNP_PERSON_DOCUMENT_TYPE_ALIASES = ["tipodocumento", "tipo_documento", "tipodoc", "tipo_doc"];

const RNP_PERSON_DOCUMENT_ALIASES = [
  "numerodocumento",
  "numero_documento",
  "nrodocumento",
  "nro_documento",
  "documento",
  "dni",
];

const RNP_ROLE_ALIASES = [
  "cargo",
  "rol",
  "tipointegrante",
  "tipo_integrante",
  "condicion",
  "calidad",
];

const ENTITY_ID_ALIASES = [
  "identidad",
  "id_entidad",
  "codigoentidad",
  "codigo_entidad",
  "codigoue",
  "cod_ue",
];

const ENTITY_NAME_ALIASES = [
  "entidadcontratante",
  "entidad_contratante",
  "entidad",
  "nombreentidad",
  "nombre_entidad",
];

const SUPPLIER_NAME_ALIASES = [
  "proveedoradjudicado",
  "proveedor_adjudicado",
  "postorganador",
  "postor_ganador",
  "proveedor",
  "contratista",
];

const SUPPLIER_DOCUMENT_ALIASES = [
  "rucproveedor",
  "ruc_proveedor",
  "rucadjudicado",
  "ruc_adjudicado",
  "ruccontratista",
  "ruc_contratista",
  "ruc",
];

const PROCESS_ID_ALIASES = [
  "idadjudicacion",
  "id_adjudicacion",
  "codigoproceso",
  "codigo_proceso",
  "procedimiento",
  "idproceso",
  "id_proceso",
];

const PROCESS_TYPE_ALIASES = [
  "tipoproceso",
  "tipo_proceso",
  "tipodeprocedimiento",
  "tipo_de_procedimiento",
  "metodocontratacion",
  "metodo_contratacion",
];

const OBJECT_DESCRIPTION_ALIASES = [
  "objeto",
  "descripcionobjeto",
  "descripcion_objeto",
  "descripcion",
  "objeto_contractual",
];

const AWARD_DATE_ALIASES = [
  "fechabuena_pro",
  "fecha_buena_pro",
  "fechaadjudicacion",
  "fecha_adjudicacion",
  "fecharegistro",
  "fecha_registro",
];

const AMOUNT_ALIASES = [
  "montoadjudicado",
  "monto_adjudicado",
  "valoradjudicado",
  "valor_adjudicado",
  "monto",
  "importe",
];

const CURRENCY_ALIASES = ["moneda", "tipomoneda", "tipo_moneda"];
const STATUS_ALIASES = ["estado", "situacion", "vigencia", "estatus"];
const ACRONYM_ALIASES = ["sigla", "acronimo", "abreviatura"];
const GOVERNMENT_LEVEL_ALIASES = ["nivelgobierno", "nivel_gobierno"];
const SECTOR_ALIASES = ["sector", "pliego"];

function normalizeCurrency(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = normalizeKey(value);
  if (["sol", "soles", "nuevo_sol", "nuevos_soles", "pen"].includes(normalized)) {
    return "PEN";
  }

  if (["dolar", "dolares", "usd", "us_dollar"].includes(normalized)) {
    return "USD";
  }

  if (["eur", "euro", "euros"].includes(normalized)) {
    return "EUR";
  }

  return value.toUpperCase();
}

function parseAmount(value: string | null) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!cleaned) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastDot > lastComma
        ? cleaned.replaceAll(",", "")
        : cleaned.replaceAll(".", "").replace(",", ".");
  } else if (lastComma > -1) {
    const fractionalLength = cleaned.length - lastComma - 1;
    normalized =
      fractionalLength > 0 && fractionalLength <= 2
        ? cleaned.replaceAll(".", "").replace(",", ".")
        : cleaned.replaceAll(",", "");
  } else {
    normalized = cleaned.replaceAll(",", "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHtmlCell(value: string) {
  return compactText(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/<[^>]+>/g, " "),
  );
}

function parseHtmlTableRecords(body: string) {
  const tableMatch = body.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    return [];
  }

  const rowMatches = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  const rows = rowMatches
    .map((rowMatch) => {
      const cellMatches = [...rowMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)];
      return cellMatches
        .map((cellMatch) => normalizeHtmlCell(cellMatch[1] ?? ""))
        .filter((cell): cell is string => cell != null);
    })
    .filter((row) => row.length > 0);

  const [headerRow, ...dataRows] = rows;
  if (!headerRow || dataRows.length === 0) {
    return [];
  }

  return dataRows
    .map((row) =>
      Object.fromEntries(headerRow.map((header, index) => [header, row[index] ?? null])),
    )
    .filter((row) => Object.values(row).some((value) => value != null));
}

function getDatasetRecords(dataset: SeaceDownloadedDataset) {
  if (dataset.records) {
    return dataset.records;
  }

  if (dataset.format === "json") {
    return parseJsonRecords(JSON.parse(dataset.body));
  }

  if (dataset.format === "csv" || dataset.contentType?.includes("csv")) {
    return parseCsvRecords(dataset.body);
  }

  if (
    dataset.format === "html" ||
    dataset.contentType?.includes("text/html") ||
    /<table[\s\S]*?>/i.test(dataset.body)
  ) {
    return parseHtmlTableRecords(dataset.body);
  }

  return [];
}

function dedupeByFingerprint<T extends { sourceExternalId: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.sourceExternalId)) {
      return false;
    }

    seen.add(row.sourceExternalId);
    return true;
  });
}

function normalizeRnpLinkRow(
  dataset: SeaceDownloadedDataset,
  row: Record<string, unknown>,
): SeaceNormalizedRnpLink | null {
  const values = toKeyedRow(row);
  const providerName =
    readRowString(values, RNP_PROVIDER_NAME_ALIASES, ["proveedor", "razon", "social"]) ?? null;
  const providerDocumentNumber = normalizeDocumentNumber(
    readRowString(values, RNP_PROVIDER_DOCUMENT_ALIASES, ["ruc"]),
  );
  const personFullName =
    readRowString(values, RNP_PERSON_NAME_ALIASES, ["persona", "integrante", "representante"]) ??
    readNameFromComponents(values) ??
    null;
  const personDocumentNumber = normalizeDocumentNumber(
    readRowString(values, RNP_PERSON_DOCUMENT_ALIASES, ["documento", "dni"]),
  );
  const relationshipType =
    readRowString(values, RNP_ROLE_ALIASES, ["cargo", "rol", "condicion"]) ?? null;

  if (!providerName || !personFullName || !relationshipType) {
    return null;
  }

  const normalizedProviderName = normalizeName(providerName);
  const normalizedPersonName = normalizeName(personFullName);
  const providerExternalId =
    providerDocumentNumber ?? `provider:${slugify(normalizedProviderName)}`;
  const observedAt =
    parseIsoDate(
      readRowString(values, ["fechaactualizacion", "fecha_actualizacion"], ["fecha", "vigencia"]),
    ) ??
    parseIsoDate(dataset.modifiedAt) ??
    new Date().toISOString().slice(0, 10);

  const sourceExternalId = `seace:rnp:${hashNormalizedPayload({
    observedAt,
    personDocumentNumber,
    providerExternalId,
    relationshipType: normalizeName(relationshipType),
  })}`;

  return {
    normalizedPersonName,
    normalizedProviderName,
    observedAt,
    personDocumentNumber,
    personDocumentType: readRowString(values, RNP_PERSON_DOCUMENT_TYPE_ALIASES, [
      "tipo",
      "documento",
    ]),
    personFullName,
    providerDocumentNumber,
    providerExternalId,
    providerName,
    rawPayload: row,
    relationshipType,
    sourceExternalId,
    sourceUrl: dataset.sourceUrl,
  };
}

function normalizeAwardRow(
  dataset: SeaceDownloadedDataset,
  row: Record<string, unknown>,
): SeaceNormalizedAward | null {
  const values = toKeyedRow(row);
  const contractingEntityName =
    readRowString(values, ENTITY_NAME_ALIASES, ["entidad", "contratante"]) ?? null;
  const supplierName =
    readRowString(values, SUPPLIER_NAME_ALIASES, ["proveedor", "postor", "contratista"]) ?? null;

  if (!contractingEntityName || !supplierName) {
    return null;
  }

  const normalizedContractingEntityName = normalizeName(contractingEntityName);
  const normalizedSupplierName = normalizeName(supplierName);
  const supplierDocumentNumber = normalizeDocumentNumber(
    readRowString(values, SUPPLIER_DOCUMENT_ALIASES, ["ruc"]),
  );
  const processExternalId =
    readRowString(values, PROCESS_ID_ALIASES, ["proceso", "adjudicacion", "procedimiento"]) ??
    `process:${hashNormalizedPayload({
      amount: parseAmount(readRowString(values, AMOUNT_ALIASES, ["monto", "importe"])),
      entity: normalizedContractingEntityName,
      supplier: normalizedSupplierName,
    })}`;
  const awardedAt = parseIsoDate(readRowString(values, AWARD_DATE_ALIASES, ["fecha"]));
  const totalAmount = parseAmount(readRowString(values, AMOUNT_ALIASES, ["monto", "importe"]));
  const supplierExternalId =
    supplierDocumentNumber ?? `supplier:${slugify(normalizedSupplierName)}`;
  const contractingEntityExternalId =
    normalizeDocumentNumber(readRowString(values, ENTITY_ID_ALIASES, ["entidad", "codigo"])) ??
    `entity:${slugify(normalizedContractingEntityName)}`;

  const sourceExternalId = `seace:award:${hashNormalizedPayload({
    awardedAt,
    contractingEntityExternalId,
    processExternalId,
    supplierExternalId,
    totalAmount,
  })}`;

  return {
    awardedAt,
    contractingEntityExternalId,
    contractingEntityName,
    currency: normalizeCurrency(readRowString(values, CURRENCY_ALIASES, ["moneda"])),
    normalizedContractingEntityName,
    normalizedSupplierName,
    objectDescription: readRowString(values, OBJECT_DESCRIPTION_ALIASES, ["objeto", "descripcion"]),
    processExternalId,
    processType: readRowString(values, PROCESS_TYPE_ALIASES, ["tipo", "proceso", "procedimiento"]),
    rawPayload: row,
    sourceExternalId,
    sourceUrl: dataset.sourceUrl,
    status: readRowString(values, STATUS_ALIASES, ["estado", "situacion"]),
    supplierDocumentNumber,
    supplierExternalId,
    supplierName,
    totalAmount,
  };
}

function normalizeContractingEntityRow(
  dataset: SeaceDownloadedDataset,
  row: Record<string, unknown>,
): SeaceNormalizedContractingEntity | null {
  const values = toKeyedRow(row);
  const entityName = readRowString(values, ENTITY_NAME_ALIASES, ["entidad"]) ?? null;
  if (!entityName) {
    return null;
  }

  const normalizedEntityName = normalizeName(entityName);
  const entityExternalId =
    normalizeDocumentNumber(readRowString(values, ENTITY_ID_ALIASES, ["entidad", "codigo"])) ??
    `entity:${slugify(normalizedEntityName)}`;

  return {
    acronym: readRowString(values, ACRONYM_ALIASES, ["sigla", "acronimo"]),
    entityExternalId,
    entityName,
    governmentLevel: readRowString(values, GOVERNMENT_LEVEL_ALIASES, ["nivel", "gobierno"]),
    normalizedEntityName,
    rawPayload: row,
    sector: readRowString(values, SECTOR_ALIASES, ["sector", "pliego"]),
    sourceExternalId: `seace:entity:${entityExternalId}`,
    sourceUrl: dataset.sourceUrl,
    status: readRowString(values, STATUS_ALIASES, ["estado", "situacion", "vigencia"]),
  };
}

export function normalizeSeaceDatasets(
  datasets: SeaceDownloadedDataset[],
): SeaceNormalizationResult {
  const errors: string[] = [];
  let skipped = 0;

  const rnpDataset = datasets.find((dataset) => dataset.kind === "rnp_people");
  const awardsDataset = datasets.find((dataset) => dataset.kind === "awards");
  const entitiesDataset = datasets.find((dataset) => dataset.kind === "contracting_entities");

  if (!rnpDataset || !awardsDataset || !entitiesDataset) {
    throw new Error("Missing SEACE MVP datasets for normalization.");
  }

  const rnpLinks: SeaceNormalizedRnpLink[] = [];
  const awards: SeaceNormalizedAward[] = [];
  const contractingEntities: SeaceNormalizedContractingEntity[] = [];

  for (const row of getDatasetRecords(rnpDataset)) {
    const normalized = normalizeRnpLinkRow(rnpDataset, row);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    rnpLinks.push(normalized);
  }

  if (rnpLinks.length === 0) {
    errors.push("No valid RNP relationship rows were normalized from SEACE.");
  }

  for (const row of getDatasetRecords(awardsDataset)) {
    const normalized = normalizeAwardRow(awardsDataset, row);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    awards.push(normalized);
  }

  if (awards.length === 0) {
    errors.push("No valid award rows were normalized from SEACE.");
  }

  for (const row of getDatasetRecords(entitiesDataset)) {
    const normalized = normalizeContractingEntityRow(entitiesDataset, row);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    contractingEntities.push(normalized);
  }

  if (contractingEntities.length === 0) {
    errors.push("No valid contracting entity rows were normalized from SEACE.");
  }

  return {
    awards: dedupeByFingerprint(awards),
    contractingEntities: dedupeByFingerprint(contractingEntities),
    errors,
    rnpLinks: dedupeByFingerprint(rnpLinks),
    skipped,
  };
}

export { normalizeAwardRow, normalizeContractingEntityRow, normalizeRnpLinkRow };
