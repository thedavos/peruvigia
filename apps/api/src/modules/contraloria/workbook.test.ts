import ExcelJS from "exceljs";

import { normalizeParsedRow, parseAttachmentRows } from "./workbook";
import type { SourceAttachment } from "./types";

async function createAttachment(
  fileName: string,
  rows: Array<Record<string, string | number | Date | null>>,
): Promise<SourceAttachment> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sanciones");
  const [firstRow] = rows;

  if (firstRow) {
    worksheet.addRow(Object.keys(firstRow));
  }

  for (const row of rows) {
    worksheet.addRow(Object.values(row));
  }

  const workbookData = await workbook.xlsx.writeBuffer();

  return {
    attachmentUrl: `https://example.com/${fileName}`,
    family: "ley_31288",
    fileName,
    reportDate: "2026-03-27",
    reportUrl: "https://example.com/report",
    workbookData: Buffer.from(workbookData),
  };
}

async function createWorkbookAttachment(
  fileName: string,
  configure: (worksheet: ExcelJS.Worksheet) => void,
): Promise<SourceAttachment> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sanciones");

  configure(worksheet);

  const workbookData = await workbook.xlsx.writeBuffer();

  return {
    attachmentUrl: `https://example.com/${fileName}`,
    family: "ley_31288",
    fileName,
    reportDate: "2026-03-27",
    reportUrl: "https://example.com/report",
    workbookData: Buffer.from(workbookData),
  };
}

test("parseAttachmentRows normalizes heterogenous workbook columns", async () => {
  const attachment = await createAttachment("ley-31288.xlsx", [
    {
      "Apellidos y Nombres": "PEREZ GOMEZ JUANA",
      DNI: "12345678",
      Entidad: "Municipalidad de Lima",
      Estado: "Vigente",
      "Fecha de Resolucion": "27/03/2026",
      "Nro Resolucion": "ABC-2026",
      "Tipo de Sancion": "Inhabilitacion",
    },
  ]);

  const rows = await parseAttachmentRows(attachment);
  expect(rows.length).toBe(1);

  const [row] = rows;
  expect(row?.documentNumber).toBe("12345678");
  expect(row?.entityName).toBe("Municipalidad de Lima");
  expect(row?.resolutionDate).toBe("2026-03-27");
  expect(row?.sanctionType).toBe("Inhabilitacion");
});

test("normalizeParsedRow builds a stable fingerprint despite cosmetic variations", async () => {
  const attachmentA = await createAttachment("ley-31288-a.xlsx", [
    {
      "Apellidos y Nombres": "Perez Gomez Juana",
      DNI: "12345678",
      Entidad: "Municipalidad de Lima",
      "Fecha de Inicio": "01/01/2026",
      "Fecha de Resolucion": "27/03/2026",
      "Nro Resolucion": "ABC-2026",
      "Tipo de Sancion": "Inhabilitacion",
    },
  ]);
  const attachmentB = await createAttachment("ley-31288-b.xlsx", [
    {
      "Apellidos y Nombres": "  PÉREZ   GÓMEZ JUANA ",
      DNI: "12345678",
      Entidad: "Municipalidad   de Lima",
      "Fecha de Inicio": "2026-01-01",
      "Fecha de Resolucion": "2026-03-27",
      "Nro Resolucion": "abc 2026",
      "Tipo de Sancion": "Inhabilitación",
    },
  ]);

  const parsedRowsA = await parseAttachmentRows(attachmentA);
  const parsedRowsB = await parseAttachmentRows(attachmentB);
  const normalizedA = normalizeParsedRow(parsedRowsA[0]!);
  const normalizedB = normalizeParsedRow(parsedRowsB[0]!);

  expect(normalizedA).toBeTruthy();
  expect(normalizedB).toBeTruthy();
  expect(normalizedA?.fingerprintHash).toBe(normalizedB?.fingerprintHash);
  expect(normalizedA?.canonicalKey.includes("dni:12345678")).toBe(true);
});

test("parseAttachmentRows supports real contraloria headers with footnotes", async () => {
  const attachment = await createWorkbookAttachment("real-layout.xlsx", (worksheet) => {
    worksheet.addRow([
      "",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
      "RELACION DE SANCIONES",
    ]);
    worksheet.addRow([
      "",
      "N°",
      "Nombres y Apellidos (1)",
      "DNI",
      "Infracción (2)",
      "Infracción (2)",
      "Infracción (2)",
      "Infracción (2)",
      "Sanción",
      "Plazo",
      "Resolución",
      "Vigencia de la Sanción (3)",
      "Vigencia de la Sanción (3)",
      "Entidad ",
    ]);
    worksheet.addRow([
      "",
      "N°",
      "Nombres y Apellidos (1)",
      "DNI",
      "Infracción (2)",
      "Infracción (2)",
      "Infracción (2)",
      "Infracción (2)",
      "Sanción",
      "Plazo",
      "Resolución",
      "Fecha de Inicio",
      "Fecha de Término",
      "Entidad ",
    ]);
    worksheet.addRow([
      "",
      1,
      "ABIGAIL YABET MAMANI MAMANI",
      "42742829",
      "artículo 46, numeral 21, muy grave",
      "",
      "",
      "",
      "Inhabilitación",
      "3 años y 5 meses",
      "000170-2024-CG/OSAN",
      new Date("2024-03-25T19:00:00-05:00"),
      new Date("2027-08-24T19:00:00-05:00"),
      "MUNICIPALIDAD DISTRITAL DE SAN JUAN DE SALINAS",
    ]);
  });

  const parsedRows = await parseAttachmentRows(attachment);
  const normalizedRows = parsedRows
    .map((row) => normalizeParsedRow(row))
    .filter((row): row is NonNullable<typeof row> => row != null);

  expect(normalizedRows).toHaveLength(1);
  expect(normalizedRows[0]?.fullName).toBe("ABIGAIL YABET MAMANI MAMANI");
  expect(normalizedRows[0]?.sanctionType).toBe("Inhabilitación");
  expect(normalizedRows[0]?.startDate).toBe("2024-03-26");
  expect(normalizedRows[0]?.endDate).toBe("2027-08-25");
});

test("normalizeParsedRow ignores footnote rows repeated across columns", () => {
  const normalized = normalizeParsedRow({
    attachmentUrl: "https://example.com/file.xlsx",
    documentNumber: "1ESTARELACIONCONSIDERAAAQUELLOSFUNCIONARIOSYSERVIDORESPUBLICOSSANCIONADOS",
    endDate: null,
    entityName:
      "(1) Esta relación no considera a aquellos funcionarios y servidores públicos sancionados.",
    family: "ley_29622",
    fullName:
      "(1) Esta relación no considera a aquellos funcionarios y servidores públicos sancionados.",
    rawPayload: {},
    regime: "ley_29622",
    reportDate: "2026-03-27",
    reportUrl: "https://example.com/report",
    resolutionDate: null,
    resolutionNumber:
      "(1) Esta relación no considera a aquellos funcionarios y servidores públicos sancionados.",
    rowNumber: 55,
    sanctionType:
      "(1) Esta relación no considera a aquellos funcionarios y servidores públicos sancionados.",
    sheetName: "Hoja1",
    sourceFileName: "real-layout.xlsx",
    startDate: null,
    statusRaw: null,
  });

  expect(normalized).toBeNull();
});
