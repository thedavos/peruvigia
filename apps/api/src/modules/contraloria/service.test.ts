import { runContraloriaSync } from "./service.ts";
import type {
  AcquireOptions,
  ContraloriaSyncResult,
  NormalizedSanctionRecord,
  ParsedWorkbookRow,
  SourceAttachment,
} from "./types.ts";

const fakeDatabaseClient = {} as never;

test("runContraloriaSync recalculates attention profiles for affected people", async () => {
  const attachments: SourceAttachment[] = [
    {
      attachmentUrl: "https://example.com/report.xlsx",
      family: "ley_31288",
      fileName: "report.xlsx",
      reportDate: "2026-04-05",
      reportUrl: "https://example.com/report",
      workbookData: Buffer.from("fake"),
    },
  ];
  const parsedRows: ParsedWorkbookRow[] = [
    {
      attachmentUrl: "https://example.com/report.xlsx",
      documentNumber: "12345678",
      endDate: null,
      entityName: "Municipalidad de Lima",
      family: "ley_31288",
      fullName: "Juana Perez",
      rawPayload: {},
      regime: "Ley 31288",
      reportDate: "2026-04-05",
      reportUrl: "https://example.com/report",
      resolutionDate: "2026-04-01",
      resolutionNumber: "ABC-2026",
      rowNumber: 1,
      sanctionType: "Inhabilitacion",
      sheetName: "Sheet1",
      sourceFileName: "report.xlsx",
      startDate: "2026-04-01",
      statusRaw: "Vigente",
    },
  ];
  const normalizedRow: NormalizedSanctionRecord = {
    ...parsedRows[0]!,
    canonicalKey: "contraloria:abc",
    classification: {
      isActive: true,
      severity: 3,
      signalType: "contraloria_sanction_active",
      statusReason: "explicit",
    },
    fingerprintHash: "hash-1",
    normalizedDocumentNumber: "12345678",
    normalizedEntityName: "municipalidad de lima",
    normalizedFullName: "juana perez",
    normalizedResolutionNumber: "abc-2026",
    normalizedSanctionType: "inhabilitacion",
  };
  const persisted: ContraloriaSyncResult = {
    affectedPersonIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    errors: ["persistence warning"],
    summary: {
      downloaded: 1,
      failed: 0,
      inserted: 1,
      processed: 1,
      reused: 0,
      skipped: 0,
      updated: 0,
    },
  };
  const recalculatedCalls: string[][] = [];

  const result = await runContraloriaSync({} satisfies AcquireOptions, fakeDatabaseClient, {
    acquireAttachments: async () => attachments,
    getLatestImportedReportDate: async () => null,
    normalizeRow: () => normalizedRow,
    parseRows: async () => parsedRows,
    persistRecords: async () => persisted,
    recalculateAttentionProfiles: async (personIds) => {
      recalculatedCalls.push(personIds);
      return personIds;
    },
  });

  expect(recalculatedCalls).toEqual([["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]]);
  expect(result.affectedPersonIds).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  expect(result.errors).toEqual(["persistence warning"]);
  expect(result.summary).toEqual(persisted.summary);
});
