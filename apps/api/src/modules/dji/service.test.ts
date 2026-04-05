import { runDjiSync } from "./service.ts";
import type { DjiDownloadedDataset, DjiNormalizedDeclaration, DjiSyncResult } from "./types.ts";

const fakeDatabaseClient = {} as never;

test("runDjiSync recalculates attention profiles for affected people", async () => {
  const datasets: DjiDownloadedDataset[] = [
    {
      format: "json",
      kind: "declarations",
      modifiedAt: "2026-04-05",
      rows: [],
      sourceUrl: "https://example.com/dji.json",
      title: "declarations",
    },
  ];
  const normalized = {
    declarations: [
      {
        currentPosition: "Gerente",
        declarationExternalId: "DECL-1",
        documentNumber: "12345678",
        entityLinks: [],
        fullName: "Juana Perez",
        institutionName: "Municipalidad de Lima",
        normalizedName: "juana perez",
        observedAt: "2026-04-05",
        personLinks: [],
        rawDeclaration: {},
        rawLinksByKind: {},
        sourceUrl: "https://example.com/dji.json",
      },
    ] satisfies DjiNormalizedDeclaration[],
    errors: ["normalization warning"],
    skipped: 0,
  };
  const persisted: DjiSyncResult = {
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

  const result = await runDjiSync({}, fakeDatabaseClient, {
    acquireDatasets: async () => datasets,
    getLatestImportedObservedAt: async () => null,
    normalizeDatasets: () => normalized,
    persistDeclarations: async () => persisted,
    recalculateAttentionProfiles: async (personIds) => {
      recalculatedCalls.push(personIds);
      return personIds;
    },
  });

  expect(recalculatedCalls).toEqual([["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]]);
  expect(result.affectedPersonIds).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  expect(result.errors).toEqual(["normalization warning", "persistence warning"]);
  expect(result.summary).toEqual(persisted.summary);
});
