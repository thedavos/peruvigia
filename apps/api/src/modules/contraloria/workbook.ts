import ExcelJS from "exceljs";

import {
  compactText,
  normalizeDocumentNumber,
  normalizeKey,
  normalizeName,
  normalizeWhitespace,
} from "@peruvigia/shared";
import { hashNormalizedPayload } from "@peruvigia/shared/node";

import { classifySanction } from "./classification.js";
import type {
  ContraloriaFamily,
  NormalizedSanctionRecord,
  ParsedWorkbookRow,
  SourceAttachment,
} from "./types.js";

const HEADER_ALIASES = {
  documentNumber: [
    "dni",
    "documento",
    "documento_de_identidad",
    "numero_de_documento",
    "nro_documento",
    "n_documento",
  ],
  endDate: [
    "fecha_fin",
    "fecha_hasta",
    "fecha_de_termino",
    "fin_vigencia",
    "fecha_termino",
    "fecha_culminacion",
    "vence",
  ],
  entityName: [
    "entidad",
    "institucion",
    "entidad_involucrada",
    "entidad_donde_laboraba",
    "entidad_sancionadora",
  ],
  fullName: [
    "apellidos_y_nombres",
    "nombres_y_apellidos",
    "nombre_completo",
    "persona_sancionada",
    "servidor_civil",
    "funcionario",
  ],
  maternalSurname: ["apellido_materno", "materno"],
  names: ["nombres", "prenombres"],
  paternalSurname: ["apellido_paterno", "paterno"],
  resolutionDate: ["fecha_resolucion", "fecha_de_resolucion", "resolucion_fecha"],
  resolutionNumber: ["resolucion", "numero_resolucion", "nro_resolucion", "resolucion_numero"],
  sanctionType: ["tipo_sancion", "sancion", "medida_sancionadora", "tipo_de_sancion"],
  startDate: [
    "fecha_inicio",
    "fecha_de_inicio",
    "fecha_desde",
    "inicio_vigencia",
    "fecha_inicio_vigencia",
    "desde",
  ],
  statusRaw: ["estado", "vigencia", "situacion", "estatus", "condicion"],
} as const;

const KNOWN_HEADER_TOKENS = new Set<string>(
  Object.values(HEADER_ALIASES).flatMap((aliases) => aliases.map((alias) => alias)),
);

type PrimitiveCell = string | number | boolean | Date | null;
type RowSnapshot = {
  rowNumber: number;
  values: PrimitiveCell[];
};

type ExcelJsLoadBuffer = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

function toExcelJsLoadBuffer(buffer: SourceAttachment["workbookData"]): ExcelJsLoadBuffer {
  // exceljs ships a narrower Buffer type than the one exposed by current Node typings.
  return Buffer.from(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  ) as unknown as ExcelJsLoadBuffer;
}

function excelSerialToIsoDate(value: number) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  const asDate = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
  return Number.isNaN(asDate.valueOf()) ? null : asDate.toISOString().slice(0, 10);
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

function asRowSnapshots(worksheet: ExcelJS.Worksheet) {
  const rows: RowSnapshot[] = [];

  worksheet.eachRow(
    {
      includeEmpty: false,
    },
    (row) => {
      const values: PrimitiveCell[] = [];

      for (let columnIndex = 1; columnIndex <= row.cellCount; columnIndex += 1) {
        values.push(cellValueToPrimitive(row.getCell(columnIndex).value));
      }

      rows.push({
        rowNumber: row.number,
        values,
      });
    },
  );

  return rows;
}

function scoreHeaderRow(row: PrimitiveCell[]) {
  return row.reduce<number>((score, cell) => {
    if (typeof cell !== "string") {
      return score;
    }

    return score + (KNOWN_HEADER_TOKENS.has(normalizeKey(cell)) ? 1 : 0);
  }, 0);
}

function detectHeaderRow(rows: RowSnapshot[]) {
  let bestIndex = 0;
  let bestScore = -1;

  for (const [index, row] of rows.slice(0, 10).entries()) {
    const score = scoreHeaderRow(row.values);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function isRepeatedHeaderRow(row: Record<string, PrimitiveCell>) {
  return scoreHeaderRow(Object.values(row)) >= 2;
}

function getHeaderVariants(value: string) {
  const normalized = normalizeKey(value);
  const variants = new Set<string>();

  if (!normalized) {
    return variants;
  }

  variants.add(normalized);
  variants.add(normalized.replace(/(?:_\d+)+$/g, ""));

  return new Set([...variants].filter((variant) => variant.length > 0));
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

function parseDateCell(value: PrimitiveCell) {
  if (value == null || value === false) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    return excelSerialToIsoDate(value);
  }

  const raw = compactText(String(value));
  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }

  const localMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (localMatch) {
    const [, day, month, year] = localMatch;
    const fullYear = year!.length === 2 ? `20${year}` : year!;
    return `${fullYear}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function isEmptyRow(row: Record<string, PrimitiveCell>) {
  return Object.values(row).every((value) => value == null || compactText(String(value)) == null);
}

function pickRawValue(
  row: Record<string, PrimitiveCell>,
  headers: Map<string, string>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const exactHeader = headers.get(alias);
    if (exactHeader) {
      const exactValue = row[exactHeader];
      if (exactValue != null && compactText(String(exactValue)) != null) {
        return exactValue;
      }
    }

    for (const [headerKey, header] of headers.entries()) {
      if (!(headerKey === alias || headerKey.startsWith(`${alias}_`))) {
        continue;
      }

      const value = row[header];
      if (value != null && compactText(String(value)) != null) {
        return value;
      }
    }
  }

  return null;
}

function pickStringValue(
  row: Record<string, PrimitiveCell>,
  headers: Map<string, string>,
  aliases: readonly string[],
) {
  return compactText(String(pickRawValue(row, headers, aliases) ?? ""));
}

function pickDateValue(
  row: Record<string, PrimitiveCell>,
  headers: Map<string, string>,
  aliases: readonly string[],
) {
  return parseDateCell(pickRawValue(row, headers, aliases));
}

function buildFullName(row: Record<string, PrimitiveCell>, headers: Map<string, string>) {
  const direct = pickStringValue(row, headers, HEADER_ALIASES.fullName);
  if (direct) {
    return direct;
  }

  const parts = [
    pickStringValue(row, headers, HEADER_ALIASES.paternalSurname),
    pickStringValue(row, headers, HEADER_ALIASES.maternalSurname),
    pickStringValue(row, headers, HEADER_ALIASES.names),
  ].filter((part): part is string => part != null);

  return parts.length > 0 ? parts.join(" ") : null;
}

function extractWorksheetRows(
  attachment: SourceAttachment,
  sheetName: string,
  worksheet: ExcelJS.Worksheet,
): ParsedWorkbookRow[] {
  const rows = asRowSnapshots(worksheet);
  if (rows.length === 0) {
    return [];
  }

  const headerRowIndex = detectHeaderRow(rows);
  const headerSnapshot = rows[headerRowIndex];
  if (!headerSnapshot) {
    return [];
  }

  const normalizedHeaders = new Map<string, string>();

  for (const rawHeader of headerSnapshot.values) {
    if (typeof rawHeader !== "string") {
      continue;
    }

    for (const normalizedHeader of getHeaderVariants(rawHeader)) {
      if (!normalizedHeaders.has(normalizedHeader)) {
        normalizedHeaders.set(normalizedHeader, rawHeader);
      }
    }
  }

  return rows.slice(headerRowIndex + 1).flatMap((rowSnapshot) => {
    const row = Object.fromEntries(
      headerSnapshot.values.map((header, index) => [
        String(header ?? `column_${index + 1}`),
        rowSnapshot.values[index] ?? null,
      ]),
    ) as Record<string, PrimitiveCell>;

    if (isEmptyRow(row) || isRepeatedHeaderRow(row)) {
      return [];
    }

    const rawPayload = Object.fromEntries(
      Object.entries(row).map(([header, value]) => [header, stringifyCellValue(value)]),
    );

    return [
      {
        attachmentUrl: attachment.attachmentUrl,
        documentNumber: normalizeDocumentNumber(
          pickStringValue(row, normalizedHeaders, HEADER_ALIASES.documentNumber),
        ),
        endDate: pickDateValue(row, normalizedHeaders, HEADER_ALIASES.endDate),
        entityName: pickStringValue(row, normalizedHeaders, HEADER_ALIASES.entityName),
        family: attachment.family,
        fullName: buildFullName(row, normalizedHeaders),
        rawPayload,
        regime: attachment.family,
        reportDate: attachment.reportDate,
        reportUrl: attachment.reportUrl,
        resolutionDate: pickDateValue(row, normalizedHeaders, HEADER_ALIASES.resolutionDate),
        resolutionNumber: pickStringValue(row, normalizedHeaders, HEADER_ALIASES.resolutionNumber),
        rowNumber: rowSnapshot.rowNumber,
        sanctionType: pickStringValue(row, normalizedHeaders, HEADER_ALIASES.sanctionType),
        sheetName,
        sourceFileName: attachment.fileName,
        startDate: pickDateValue(row, normalizedHeaders, HEADER_ALIASES.startDate),
        statusRaw: pickStringValue(row, normalizedHeaders, HEADER_ALIASES.statusRaw),
      },
    ];
  });
}

export async function parseAttachmentRows(attachment: SourceAttachment) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toExcelJsLoadBuffer(attachment.workbookData));

  return workbook.worksheets.flatMap((worksheet) =>
    extractWorksheetRows(attachment, worksheet.name, worksheet),
  );
}

function inferCanonicalKey(record: {
  documentNumber: string | null;
  family: ContraloriaFamily;
  normalizedFullName: string;
  resolutionNumber: string | null;
  sanctionType: string;
}) {
  const identityPart = record.documentNumber
    ? `dni:${record.documentNumber}`
    : `name:${record.normalizedFullName.replace(/ /g, "-")}`;
  const resolutionPart = record.resolutionNumber
    ? `res:${normalizeKey(record.resolutionNumber).replace(/_/g, "-")}`
    : "res:sin-resolucion";
  const sanctionPart = `type:${normalizeKey(record.sanctionType).replace(/_/g, "-")}`;

  return normalizeWhitespace(
    `contraloria:${record.family}:${identityPart}:${resolutionPart}:${sanctionPart}`,
  );
}

function isLikelyFootnoteRow(row: ParsedWorkbookRow) {
  const fullName = compactText(row.fullName);
  const sanctionType = compactText(row.sanctionType);

  if (!fullName || !sanctionType) {
    return false;
  }

  if (
    fullName.startsWith("(") &&
    sanctionType === fullName &&
    row.entityName === fullName &&
    row.resolutionNumber === fullName
  ) {
    return true;
  }

  if (!row.documentNumber) {
    return false;
  }

  return row.documentNumber.length > 16 && sanctionType === fullName;
}

export function normalizeParsedRow(row: ParsedWorkbookRow): NormalizedSanctionRecord | null {
  if (isLikelyFootnoteRow(row)) {
    return null;
  }

  const fullName = compactText(row.fullName);
  const sanctionType = compactText(row.sanctionType);

  if (!fullName || !sanctionType) {
    return null;
  }

  const normalizedFullName = normalizeName(fullName);
  if (normalizedFullName.length === 0) {
    return null;
  }

  const normalizedEntityName = row.entityName ? normalizeName(row.entityName) : null;
  const normalizedResolutionNumber = row.resolutionNumber
    ? normalizeKey(row.resolutionNumber).replace(/_/g, "-")
    : null;
  const normalizedSanctionType = normalizeKey(sanctionType).replace(/_/g, "-") || "sancion";

  const canonicalKey = inferCanonicalKey({
    documentNumber: row.documentNumber,
    family: row.family,
    normalizedFullName,
    resolutionNumber: row.resolutionNumber,
    sanctionType,
  });

  const fingerprintHash = hashNormalizedPayload({
    documentNumber: row.documentNumber,
    endDate: row.endDate,
    entityName: normalizedEntityName,
    family: row.family,
    normalizedFullName,
    normalizedResolutionNumber,
    normalizedSanctionType,
    startDate: row.startDate,
  });

  const classification = classifySanction({
    endDate: row.endDate,
    family: row.family,
    reportDate: row.reportDate,
    startDate: row.startDate,
    statusRaw: row.statusRaw,
  });

  return {
    ...row,
    canonicalKey,
    classification,
    fingerprintHash,
    fullName,
    normalizedDocumentNumber: row.documentNumber,
    normalizedEntityName,
    normalizedFullName,
    normalizedResolutionNumber,
    normalizedSanctionType,
    sanctionType,
  };
}
